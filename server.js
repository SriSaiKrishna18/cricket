const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { initDb, closeDb } = require('./database/init');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Socket.io  
io.on('connection', (socket) => {
    console.log(`🔌 Spectator connected: ${socket.id}`);
    socket.on('join-match', (matchId) => {
        socket.join(`match-${matchId}`);
        console.log(`👁️  ${socket.id} watching match ${matchId}`);
    });
    socket.on('leave-match', (matchId) => socket.leave(`match-${matchId}`));
    socket.on('disconnect', () => console.log(`❌ Spectator disconnected: ${socket.id}`));
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
