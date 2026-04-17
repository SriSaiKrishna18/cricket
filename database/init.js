const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Use persistent disk on Render, or local directory for dev
const DATA_DIR = process.env.NODE_ENV === 'production' && fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
const DB_PATH = path.join(DATA_DIR, 'cricket.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db = null;
let SQL = null;

async function initDb() {
    if (db) return db;
    
    SQL = await initSqlJs();
    
    // Load existing database or create new one
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
        console.log('✅ Database loaded from', DB_PATH);
    } else {
        db = new SQL.Database();
        console.log('✅ New database created');
    }

    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON');

    // Run schema
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.run(schema);

    // Migration: add scorer_token if missing
    try {
        const cols = db.exec('PRAGMA table_info(matches)');
        if (cols.length > 0) {
            const colNames = cols[0].values.map(r => r[1]);
            if (!colNames.includes('scorer_token')) {
                db.run('ALTER TABLE matches ADD COLUMN scorer_token TEXT');
                console.log('✅ Migration: added scorer_token column');
            }
        }
    } catch(e) { /* column already exists */ }

    // Save to disk
    saveDb();

    return db;
}

function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDb() first.');
    }
    return db;
}

function saveDb() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
}

function closeDb() {
    if (db) {
        saveDb();
        db.close();
        db = null;
    }
}

// Helper: run a query and return all rows as objects
function queryAll(sql, params = []) {
    const d = getDb();
    const stmt = d.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

// Helper: run a query and return the first row as object
function queryOne(sql, params = []) {
    const d = getDb();
    const stmt = d.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    let result = null;
    if (stmt.step()) {
        result = stmt.getAsObject();
    }
    stmt.free();
    return result;
}

// Helper: execute a statement (INSERT/UPDATE/DELETE) and return info
function execute(sql, params = []) {
    const d = getDb();
    d.run(sql, params);
    const lastId = queryOne('SELECT last_insert_rowid() as id');
    const changes = queryOne('SELECT changes() as cnt');
    saveDb(); // Persist after every write
    return { lastInsertRowid: lastId ? lastId.id : 0, changes: changes ? changes.cnt : 0 };
}

module.exports = { initDb, getDb, closeDb, saveDb, queryAll, queryOne, execute };
