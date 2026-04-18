/**
 * Database Layer — Dual Mode
 * - LOCAL: Uses sql.js (file-based SQLite)
 * - PRODUCTION: Uses Turso (hosted SQLite, persistent forever)
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const USE_TURSO = !!(process.env.TURSO_DATABASE_URL);

let db = null;       // sql.js instance (local)
let turso = null;    // Turso client (production)
let SQL = null;

// ═══════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════

async function initDb() {
    if (USE_TURSO) {
        return await initTurso();
    } else {
        return await initLocal();
    }
}

async function initTurso() {
    const { createClient } = require('@libsql/client');
    turso = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN || undefined
    });

    // Run schema
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
        await turso.execute(stmt + ';');
    }

    // Migration: add scorer_token if missing
    try {
        const cols = await turso.execute('PRAGMA table_info(matches)');
        const colNames = cols.rows.map(r => r[1] || r.name);
        if (!colNames.includes('scorer_token')) {
            await turso.execute('ALTER TABLE matches ADD COLUMN scorer_token TEXT');
            console.log('✅ Migration: added scorer_token column');
        }
    } catch(e) { /* column already exists */ }

    console.log('✅ Connected to Turso (persistent cloud database)');
    return turso;
}

async function initLocal() {
    if (db) return db;
    
    const initSqlJs = require('sql.js');
    SQL = await initSqlJs();
    
    const DATA_DIR = process.env.NODE_ENV === 'production' && fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
    const DB_PATH = path.join(DATA_DIR, 'cricket.db');

    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
        console.log('✅ Database loaded from', DB_PATH);
    } else {
        db = new SQL.Database();
        console.log('✅ New database created');
    }

    db.run('PRAGMA foreign_keys = ON');

    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.run(schema);

    // Migration
    try {
        const cols = db.exec('PRAGMA table_info(matches)');
        if (cols.length > 0) {
            const colNames = cols[0].values.map(r => r[1]);
            if (!colNames.includes('scorer_token')) {
                db.run('ALTER TABLE matches ADD COLUMN scorer_token TEXT');
                console.log('✅ Migration: added scorer_token column');
            }
        }
    } catch(e) {}

    saveDb();
    return db;
}

function saveDb() {
    if (!USE_TURSO && db) {
        const DATA_DIR = process.env.NODE_ENV === 'production' && fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
        const DB_PATH = path.join(DATA_DIR, 'cricket.db');
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
}

function closeDb() {
    if (!USE_TURSO && db) {
        saveDb();
        db.close();
        db = null;
    }
}

// ═══════════════════════════════════════════
// Query Helpers — work with both backends
// ═══════════════════════════════════════════

function queryAll(sql, params = []) {
    if (USE_TURSO) {
        // Returns a promise — caller must await
        return turso.execute({ sql, args: params }).then(result => {
            return result.rows.map(row => {
                // Convert row to plain object
                const obj = {};
                result.columns.forEach((col, i) => {
                    obj[col] = row[i] !== undefined ? row[i] : row[col];
                });
                return obj;
            });
        });
    } else {
        const d = db;
        const stmt = d.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    }
}

function queryOne(sql, params = []) {
    if (USE_TURSO) {
        return turso.execute({ sql, args: params }).then(result => {
            if (result.rows.length === 0) return null;
            const row = result.rows[0];
            const obj = {};
            result.columns.forEach((col, i) => {
                obj[col] = row[i] !== undefined ? row[i] : row[col];
            });
            return obj;
        });
    } else {
        const d = db;
        const stmt = d.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        let result = null;
        if (stmt.step()) {
            result = stmt.getAsObject();
        }
        stmt.free();
        return result;
    }
}

function execute(sql, params = []) {
    if (USE_TURSO) {
        return turso.execute({ sql, args: params }).then(result => {
            return {
                lastInsertRowid: Number(result.lastInsertRowid) || 0,
                changes: result.rowsAffected || 0
            };
        });
    } else {
        const d = db;
        d.run(sql, params);
        const lastId = queryOne('SELECT last_insert_rowid() as id');
        const changes = queryOne('SELECT changes() as cnt');
        saveDb();
        return { lastInsertRowid: lastId ? lastId.id : 0, changes: changes ? changes.cnt : 0 };
    }
}

function getDb() {
    if (USE_TURSO) return turso;
    if (!db) throw new Error('Database not initialized');
    return db;
}

module.exports = { initDb, getDb, closeDb, saveDb, queryAll, queryOne, execute, USE_TURSO };
