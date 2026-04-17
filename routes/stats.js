const express = require('express');
const router = express.Router();
const { queryAll, queryOne } = require('../database/init');

// GET /api/stats/leaderboard
router.get('/leaderboard', (req, res) => {
    try {
        const players = queryAll('SELECT * FROM players');
        
        // Build stats for each player
        const playerStats = players.map(p => {
            const batDels = queryAll('SELECT runs_scored, is_wide, is_noball, is_boundary FROM deliveries WHERE batter_id = ?', [p.id]);
            let totalRuns = 0, ballsFaced = 0, boundaries = 0;
            batDels.forEach(d => {
                totalRuns += d.runs_scored;
                if (!d.is_wide && !d.is_noball) ballsFaced++;
                if (d.is_boundary) boundaries++;
            });

            const timesOut = queryOne('SELECT COUNT(*) as cnt FROM dismissals WHERE batter_id = ?', [p.id]);
            const dismissals = timesOut ? timesOut.cnt : 0;

            const bowlDels = queryAll('SELECT runs_scored, extras_runs, is_wide, is_noball, is_wicket FROM deliveries WHERE bowler_id = ?', [p.id]);
            let runsConceded = 0, wickets = 0, legalBalls = 0;
            bowlDels.forEach(d => {
                runsConceded += d.runs_scored + d.extras_runs;
                if (d.is_wicket) wickets++;
                if (!d.is_wide && !d.is_noball) legalBalls++;
            });

            const catches = queryOne("SELECT COUNT(*) as cnt FROM dismissals WHERE fielder_id = ? AND dismissal_type = 'caught_one_hand'", [p.id]);

            return {
                id: p.id,
                name: p.name,
                avatar_color: p.avatar_color,
                total_runs: totalRuns,
                balls_faced: ballsFaced,
                boundaries,
                dismissals,
                average: dismissals > 0 ? (totalRuns / dismissals).toFixed(2) : (totalRuns > 0 ? totalRuns.toFixed(2) : '0.00'),
                strike_rate: ballsFaced > 0 ? ((totalRuns / ballsFaced) * 100).toFixed(1) : '0.0',
                wickets,
                runs_conceded: runsConceded,
                legal_balls: legalBalls,
                economy: legalBalls > 0 ? ((runsConceded / legalBalls) * 6).toFixed(2) : '0.00',
                bowling_average: wickets > 0 ? (runsConceded / wickets).toFixed(2) : '-',
                catches: catches ? catches.cnt : 0
            };
        });

        // Orange Cap
        const orangeCap = [...playerStats].filter(p => p.total_runs > 0).sort((a, b) => b.total_runs - a.total_runs).slice(0, 10);
        
        // Purple Cap
        const purpleCap = [...playerStats].filter(p => p.wickets > 0).sort((a, b) => b.wickets - a.wickets || a.runs_conceded - b.runs_conceded).slice(0, 10);
        
        // Best strike rates (min 3 balls — corridor matches are short)
        const bestStrikeRates = [...playerStats].filter(p => p.balls_faced >= 3).sort((a, b) => parseFloat(b.strike_rate) - parseFloat(a.strike_rate)).slice(0, 10);
        
        // Best economy (min 3 balls)
        const bestEconomy = [...playerStats].filter(p => p.legal_balls >= 3).sort((a, b) => parseFloat(a.economy) - parseFloat(b.economy)).slice(0, 10);
        
        // Most catches
        const mostCatches = [...playerStats].filter(p => p.catches > 0).sort((a, b) => b.catches - a.catches).slice(0, 10);
        
        // Most boundaries
        const mostBoundaries = [...playerStats].filter(p => p.boundaries > 0).sort((a, b) => b.boundaries - a.boundaries).slice(0, 10);

        res.json({ orangeCap, purpleCap, bestStrikeRates, bestEconomy, mostCatches, mostBoundaries });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/stats/records
router.get('/records', (req, res) => {
    try {
        // Highest individual scores
        const allBattingInnings = queryAll(`
            SELECT d.innings_id, d.batter_id, p.name,
                   i.innings_number, m.team_a_name, m.team_b_name, m.id as match_id, m.created_at
            FROM deliveries d
            JOIN players p ON d.batter_id = p.id
            JOIN innings i ON d.innings_id = i.id
            JOIN matches m ON i.match_id = m.id
            WHERE m.status = 'completed'
        `);
        
        const inningsScores = {};
        allBattingInnings.forEach(d => {
            const key = `${d.innings_id}_${d.batter_id}`;
            if (!inningsScores[key]) {
                inningsScores[key] = { ...d, runs: 0, balls: 0 };
            }
        });

        // Need to recalculate from raw deliveries
        const completedDeliveries = queryAll(`
            SELECT d.innings_id, d.batter_id, d.runs_scored, d.is_wide, d.is_noball,
                   p.name, m.team_a_name, m.team_b_name, m.id as match_id, m.created_at
            FROM deliveries d
            JOIN players p ON d.batter_id = p.id
            JOIN innings i ON d.innings_id = i.id
            JOIN matches m ON i.match_id = m.id
            WHERE m.status = 'completed'
        `);

        const scoreMap = {};
        completedDeliveries.forEach(d => {
            const key = `${d.innings_id}_${d.batter_id}`;
            if (!scoreMap[key]) {
                scoreMap[key] = {
                    name: d.name, player_id: d.batter_id,
                    team_a_name: d.team_a_name, team_b_name: d.team_b_name,
                    match_id: d.match_id, created_at: d.created_at,
                    runs: 0, balls: 0
                };
            }
            scoreMap[key].runs += d.runs_scored;
            if (!d.is_wide && !d.is_noball) scoreMap[key].balls++;
        });

        const highestScore = Object.values(scoreMap).sort((a, b) => b.runs - a.runs).slice(0, 5);

        // Best bowling
        const bowlingDels = queryAll(`
            SELECT d.innings_id, d.bowler_id, d.runs_scored, d.extras_runs, d.is_wicket,
                   p.name, m.team_a_name, m.team_b_name, m.id as match_id, m.created_at
            FROM deliveries d
            JOIN players p ON d.bowler_id = p.id
            JOIN innings i ON d.innings_id = i.id
            JOIN matches m ON i.match_id = m.id
            WHERE m.status = 'completed'
        `);

        const bowlMap = {};
        bowlingDels.forEach(d => {
            const key = `${d.innings_id}_${d.bowler_id}`;
            if (!bowlMap[key]) {
                bowlMap[key] = {
                    name: d.name, player_id: d.bowler_id,
                    team_a_name: d.team_a_name, team_b_name: d.team_b_name,
                    match_id: d.match_id, created_at: d.created_at,
                    wickets: 0, runs: 0
                };
            }
            bowlMap[key].runs += d.runs_scored + d.extras_runs;
            if (d.is_wicket) bowlMap[key].wickets++;
        });

        const bestBowling = Object.values(bowlMap).sort((a, b) => b.wickets - a.wickets || a.runs - b.runs).slice(0, 5);

        // Highest team totals
        const highestTeamTotals = queryAll(`
            SELECT i.total_runs, i.total_wickets, i.total_balls,
                   CASE WHEN i.batting_team = 'A' THEN m.team_a_name ELSE m.team_b_name END as team_name,
                   m.team_a_name, m.team_b_name, m.id as match_id, m.created_at
            FROM innings i JOIN matches m ON i.match_id = m.id
            WHERE m.status = 'completed'
            ORDER BY i.total_runs DESC LIMIT 5
        `);

        // Lowest team totals
        const lowestTeamTotals = queryAll(`
            SELECT i.total_runs, i.total_wickets, i.total_balls,
                   CASE WHEN i.batting_team = 'A' THEN m.team_a_name ELSE m.team_b_name END as team_name,
                   m.team_a_name, m.team_b_name, m.id as match_id, m.created_at
            FROM innings i JOIN matches m ON i.match_id = m.id
            WHERE m.status = 'completed' AND i.total_balls > 0
            ORDER BY i.total_runs ASC LIMIT 5
        `);

        const totalMatches = queryOne("SELECT COUNT(*) as cnt FROM matches WHERE status = 'completed'");

        res.json({ highestScore, bestBowling, highestTeamTotals, lowestTeamTotals, totalMatches: totalMatches ? totalMatches.cnt : 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/stats/head-to-head
router.get('/head-to-head', (req, res) => {
    try {
        const { p1, p2 } = req.query;
        if (!p1 || !p2) return res.status(400).json({ error: 'Two player IDs required' });

        const player1 = queryOne('SELECT * FROM players WHERE id = ?', [Number(p1)]);
        const player2 = queryOne('SELECT * FROM players WHERE id = ?', [Number(p2)]);
        if (!player1 || !player2) return res.status(404).json({ error: 'Player not found' });

        // p1 batting vs p2 bowling
        const p1vs = queryAll('SELECT runs_scored, is_wide, is_noball, is_wicket, is_boundary FROM deliveries WHERE batter_id = ? AND bowler_id = ?', [Number(p1), Number(p2)]);
        let p1Runs = 0, p1Balls = 0, p1Dismissed = 0, p1Boundaries = 0;
        p1vs.forEach(d => {
            p1Runs += d.runs_scored;
            if (!d.is_wide && !d.is_noball) p1Balls++;
            if (d.is_wicket) p1Dismissed++;
            if (d.is_boundary) p1Boundaries++;
        });

        // p2 batting vs p1 bowling
        const p2vs = queryAll('SELECT runs_scored, is_wide, is_noball, is_wicket, is_boundary FROM deliveries WHERE batter_id = ? AND bowler_id = ?', [Number(p2), Number(p1)]);
        let p2Runs = 0, p2Balls = 0, p2Dismissed = 0, p2Boundaries = 0;
        p2vs.forEach(d => {
            p2Runs += d.runs_scored;
            if (!d.is_wide && !d.is_noball) p2Balls++;
            if (d.is_wicket) p2Dismissed++;
            if (d.is_boundary) p2Boundaries++;
        });

        res.json({
            player1: { ...player1, batting_vs: { runs: p1Runs, balls: p1Balls, dismissals: p1Dismissed, boundaries: p1Boundaries }, bowling_vs: { runs: p2Runs, balls: p2Balls, dismissals: p2Dismissed, boundaries: p2Boundaries } },
            player2: { ...player2, batting_vs: { runs: p2Runs, balls: p2Balls, dismissals: p2Dismissed, boundaries: p2Boundaries }, bowling_vs: { runs: p1Runs, balls: p1Balls, dismissals: p1Dismissed, boundaries: p1Boundaries } }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/stats/overview
router.get('/overview', (req, res) => {
    try {
        const totalMatches = queryOne("SELECT COUNT(*) as cnt FROM matches WHERE status = 'completed'");
        const totalPlayers = queryOne('SELECT COUNT(*) as cnt FROM players');
        const totalRuns = queryOne('SELECT COALESCE(SUM(runs_scored), 0) as cnt FROM deliveries');
        const totalWickets = queryOne('SELECT COUNT(*) as cnt FROM dismissals');
        const liveMatch = queryOne("SELECT * FROM matches WHERE status = 'live' ORDER BY started_at DESC LIMIT 1");

        // Top scorer
        const players = queryAll('SELECT * FROM players');
        let topScorer = { name: '-', runs: 0 };
        let topWicketTaker = { name: '-', wickets: 0 };

        players.forEach(p => {
            const runs = queryOne('SELECT COALESCE(SUM(runs_scored), 0) as r FROM deliveries WHERE batter_id = ?', [p.id]);
            if (runs && runs.r > topScorer.runs) topScorer = { name: p.name, runs: runs.r };
            
            const wkts = queryOne('SELECT COUNT(*) as w FROM deliveries WHERE bowler_id = ? AND is_wicket = 1', [p.id]);
            if (wkts && wkts.w > topWicketTaker.wickets) topWicketTaker = { name: p.name, wickets: wkts.w };
        });

        res.json({
            totalMatches: totalMatches ? totalMatches.cnt : 0,
            totalPlayers: totalPlayers ? totalPlayers.cnt : 0,
            totalRuns: totalRuns ? totalRuns.cnt : 0,
            totalWickets: totalWickets ? totalWickets.cnt : 0,
            liveMatch,
            topScorer,
            topWicketTaker
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
