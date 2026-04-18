const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const { initDb, closeDb } = require('./database/init');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    pingTimeout: 60000
});

app.set('io', io);

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json());

// Static files with caching — CSS/JS cached 1 hour, HTML never cached
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    setHeaders: function(res, filePath) {
        // HTML pages: never cache (so updates are instant)
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    }
}));

// Socket.io — minimal logging
io.on('connection', (socket) => {
    socket.on('join-match', (matchId) => {
        socket.join(`match-${matchId}`);
    });
    socket.on('leave-match', (matchId) => socket.leave(`match-${matchId}`));
});

// Page routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/match', (req, res) => res.sendFile(path.join(__dirname, 'public', 'match.html')));
app.get('/scoring', (req, res) => res.sendFile(path.join(__dirname, 'public', 'scoring.html')));
app.get('/stats', (req, res) => res.sendFile(path.join(__dirname, 'public', 'stats.html')));
app.get('/history', (req, res) => res.sendFile(path.join(__dirname, 'public', 'history.html')));
app.get('/leaderboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'leaderboard.html')));
app.get('/new-match', (req, res) => res.sendFile(path.join(__dirname, 'public', 'new-match.html')));

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🏏 Stumps drawn! Server shutting down...');
    closeDb();
    server.close(() => process.exit(0));
});

const PORT = process.env.PORT || 3000;

// Initialize DB then start server
initDb().then(() => {
    // Register API routes AFTER DB is ready
    app.use('/api/players', require('./routes/players'));
    app.use('/api/matches', require('./routes/matches'));
    app.use('/api/stats', require('./routes/stats'));

    server.listen(PORT, () => {
        console.log(`\n🏏 Corridor Cricket is LIVE on http://localhost:${PORT}`);
        console.log(`📊 API available at http://localhost:${PORT}/api`);
        console.log(`🔌 Socket.io ready for live updates\n`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});
