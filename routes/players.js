const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute } = require('../database/init');

// GET /api/players
router.get('/', async (req, res) => {
    try {
        const players = await queryAll('SELECT * FROM players ORDER BY name ASC');
        res.json(players);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/players
router.post('/', async (req, res) => {
    try {
        const { name, avatar_color } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Player name is required' });
        }
        const existing = await queryOne('SELECT id FROM players WHERE name = ?', [name.trim()]);
        if (existing) {
            return res.status(409).json({ error: 'Player name already exists' });
        }
        const color = avatar_color || `hsl(${Math.floor(Math.random() * 360)}, 55%, 55%)`;
        const result = await execute('INSERT INTO players (name, avatar_color) VALUES (?, ?)', [name.trim(), color]);
        const player = await queryOne('SELECT * FROM players WHERE id = ?', [result.lastInsertRowid]);
        res.status(201).json(player);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/players/:id
router.delete('/:id', async (req, res) => {
    try {
        await execute('DELETE FROM players WHERE id = ?', [Number(req.params.id)]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/players/:id/stats
router.get('/:id/stats', async (req, res) => {
    try {
        const playerId = Number(req.params.id);
        const player = await queryOne('SELECT * FROM players WHERE id = ?', [playerId]);
        if (!player) return res.status(404).json({ error: 'Player not found' });

        // Batting stats
        const battingRows = await queryAll('SELECT innings_id, runs_scored, is_wide, is_noball, is_boundary, is_miss FROM deliveries WHERE batter_id = ?', [playerId]);
        
        let totalRuns = 0, ballsFaced = 0, boundaries = 0;
        const inningsMap = {};
        battingRows.forEach(d => {
            totalRuns += d.runs_scored;
            if (!d.is_wide && !d.is_noball) ballsFaced++;
            if (d.is_boundary) boundaries++;
            if (!inningsMap[d.innings_id]) inningsMap[d.innings_id] = 0;
            inningsMap[d.innings_id] += d.runs_scored;
        });
        
        const inningsIds = Object.keys(inningsMap);
        const inningsCount = inningsIds.length;
        const highestScore = inningsIds.length > 0 ? Math.max(...Object.values(inningsMap)) : 0;
        const fifties = Object.values(inningsMap).filter(r => r >= 50).length;
        
        const timesOut = await queryOne('SELECT COUNT(*) as cnt FROM dismissals WHERE batter_id = ?', [playerId]);
        const dismissals = timesOut ? timesOut.cnt : 0;

        // Bowling stats  
        const bowlingRows = await queryAll('SELECT runs_scored, extras_runs, is_wide, is_noball, is_wicket FROM deliveries WHERE bowler_id = ?', [playerId]);
        let bowlBalls = 0, runsConceded = 0, wickets = 0, legalBalls = 0;
        bowlingRows.forEach(d => {
            bowlBalls++;
            runsConceded += d.runs_scored + d.extras_runs;
            if (d.is_wicket) wickets++;
            if (!d.is_wide && !d.is_noball) legalBalls++;
        });

        // Best bowling
        const bowlingByInnings = {};
        const bowlingDeliveries = await queryAll('SELECT innings_id, runs_scored, extras_runs, is_wicket FROM deliveries WHERE bowler_id = ?', [playerId]);
        bowlingDeliveries.forEach(d => {
            if (!bowlingByInnings[d.innings_id]) bowlingByInnings[d.innings_id] = { wickets: 0, runs: 0 };
            bowlingByInnings[d.innings_id].runs += d.runs_scored + d.extras_runs;
            if (d.is_wicket) bowlingByInnings[d.innings_id].wickets++;
        });
        
        let bestBowling = '-';
        let bestW = 0, bestR = 999;
        Object.values(bowlingByInnings).forEach(b => {
            if (b.wickets > bestW || (b.wickets === bestW && b.runs < bestR)) {
                bestW = b.wickets;
                bestR = b.runs;
                bestBowling = `${b.wickets}/${b.runs}`;
            }
        });
        if (bestW === 0) bestBowling = '-';

        // Catches
        const catches = await queryOne("SELECT COUNT(*) as cnt FROM dismissals WHERE fielder_id = ? AND dismissal_type = 'caught_one_hand'", [playerId]);

        // Matches
        const matchesPlayed = await queryOne('SELECT COUNT(DISTINCT match_id) as matches FROM match_players WHERE player_id = ?', [playerId]);

        const battingAvg = dismissals > 0 ? (totalRuns / dismissals).toFixed(2) : (totalRuns > 0 ? totalRuns.toFixed(2) : '0.00');
        const strikeRate = ballsFaced > 0 ? ((totalRuns / ballsFaced) * 100).toFixed(1) : '0.0';
        const bowlingAvg = wickets > 0 ? (runsConceded / wickets).toFixed(2) : '-';
        const economy = legalBalls > 0 ? ((runsConceded / legalBalls) * 6).toFixed(2) : '0.00';

        res.json({
            player,
            matches: matchesPlayed ? matchesPlayed.matches : 0,
            batting: {
                innings: inningsCount,
                runs: totalRuns,
                balls_faced: ballsFaced,
                highest_score: highestScore,
                average: battingAvg,
                strike_rate: strikeRate,
                fifties,
                boundaries,
                not_outs: inningsCount - dismissals
            },
            bowling: {
                balls: legalBalls,
                runs_conceded: runsConceded,
                wickets,
                average: bowlingAvg,
                economy,
                best: bestBowling
            },
            fielding: {
                catches: catches ? catches.cnt : 0
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/players/:id/recent
router.get('/:id/recent', async (req, res) => {
    try {
        const playerId = Number(req.params.id);
        
        const deliveries = await queryAll(`
            SELECT d.innings_id, d.runs_scored, d.is_wide, d.is_noball, d.is_boundary,
                   i.match_id, m.team_a_name, m.team_b_name, m.created_at as match_date
            FROM deliveries d
            JOIN innings i ON d.innings_id = i.id
            JOIN matches m ON i.match_id = m.id
            WHERE d.batter_id = ?
            ORDER BY m.created_at DESC
        `, [playerId]);

        const inningsMap = {};
        deliveries.forEach(d => {
            if (!inningsMap[d.innings_id]) {
                inningsMap[d.innings_id] = {
                    innings_id: d.innings_id,
                    match_id: d.match_id,
                    team_a_name: d.team_a_name,
                    team_b_name: d.team_b_name,
                    match_date: d.match_date,
                    runs: 0,
                    balls: 0,
                    boundaries: 0
                };
            }
            inningsMap[d.innings_id].runs += d.runs_scored;
            if (!d.is_wide && !d.is_noball) inningsMap[d.innings_id].balls++;
            if (d.is_boundary) inningsMap[d.innings_id].boundaries++;
        });

        const result = Object.values(inningsMap).slice(0, 10);
        for (const r of result) {
            const dismissed = await queryOne('SELECT id FROM dismissals WHERE innings_id = ? AND batter_id = ?', [r.innings_id, playerId]);
            r.is_out = !!dismissed;
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
