const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { queryAll, queryOne, execute } = require('../database/init');
const rules = require('../engine/rules');
const commentary = require('../engine/commentary');

// Scorer middleware — pass-through (casual friends game, no strict auth needed)
// The scoring page URL (/scoring?id=X) is the "secret" — share it only with the scorer
// Spectators use /match?id=X instead
async function requireScorer(req, res, next) {
    next();
}

// GET /api/matches
router.get('/', async (req, res) => {
    try {
        const { status } = req.query;
        let matches;
        if (status) {
            matches = await queryAll('SELECT * FROM matches WHERE status = ? ORDER BY created_at DESC', [status]);
        } else {
            matches = await queryAll('SELECT * FROM matches ORDER BY created_at DESC');
        }
        
        const enriched = [];
        for (const m of matches) {
            const innings = await queryAll('SELECT * FROM innings WHERE match_id = ? ORDER BY innings_number', [m.id]);
            enriched.push({ ...m, innings, scorer_token: undefined });
        }
        
        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/matches
router.post('/', async (req, res) => {
    try {
        const { team_a_name, team_b_name, total_overs, toss_winner, toss_decision, team_a_players, team_b_players, venue } = req.body;

        if (!team_a_players?.length || !team_b_players?.length) {
            return res.status(400).json({ error: 'Both teams must have players' });
        }

        const scorerToken = crypto.randomBytes(16).toString('hex');

        const result = await execute(`
            INSERT INTO matches (team_a_name, team_b_name, total_overs, toss_winner, toss_decision, venue, scorer_token, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'upcoming')
        `, [
            team_a_name || 'Team A',
            team_b_name || 'Team B',
            total_overs ?? 0,
            toss_winner || null,
            toss_decision || null,
            venue || 'The Corridor',
            scorerToken
        ]);

        const matchId = result.lastInsertRowid;

        for (let idx = 0; idx < team_a_players.length; idx++) {
            await execute('INSERT INTO match_players (match_id, player_id, team, batting_order) VALUES (?, ?, ?, ?)', [matchId, team_a_players[idx], 'A', idx + 1]);
        }
        for (let idx = 0; idx < team_b_players.length; idx++) {
            await execute('INSERT INTO match_players (match_id, player_id, team, batting_order) VALUES (?, ?, ?, ?)', [matchId, team_b_players[idx], 'B', idx + 1]);
        }

        const match = await queryOne('SELECT * FROM matches WHERE id = ?', [matchId]);
        res.status(201).json({ ...match, scorer_token: scorerToken });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/matches/:id
router.get('/:id', async (req, res) => {
    try {
        const match = await queryOne('SELECT * FROM matches WHERE id = ?', [Number(req.params.id)]);
        if (!match) return res.status(404).json({ error: 'Match not found' });

        const innings = await queryAll('SELECT * FROM innings WHERE match_id = ? ORDER BY innings_number', [match.id]);
        const teamAPlayers = await queryAll(`
            SELECT p.*, mp.batting_order, mp.team FROM match_players mp 
            JOIN players p ON mp.player_id = p.id 
            WHERE mp.match_id = ? AND mp.team = 'A' ORDER BY mp.batting_order
        `, [match.id]);
        const teamBPlayers = await queryAll(`
            SELECT p.*, mp.batting_order, mp.team FROM match_players mp 
            JOIN players p ON mp.player_id = p.id 
            WHERE mp.match_id = ? AND mp.team = 'B' ORDER BY mp.batting_order
        `, [match.id]);

        res.json({ ...match, scorer_token: undefined, innings, teamAPlayers, teamBPlayers });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/matches/:id/start
router.put('/:id/start', requireScorer, async (req, res) => {
    try {
        const match = await queryOne('SELECT * FROM matches WHERE id = ?', [Number(req.params.id)]);
        if (!match) return res.status(404).json({ error: 'Match not found' });

        let firstBattingTeam;
        if (match.toss_winner && match.toss_decision) {
            if (match.toss_decision === 'bat') {
                firstBattingTeam = match.toss_winner === match.team_a_name ? 'A' : 'B';
            } else {
                firstBattingTeam = match.toss_winner === match.team_a_name ? 'B' : 'A';
            }
        } else {
            firstBattingTeam = 'A';
        }

        await execute("UPDATE matches SET status = 'live', started_at = datetime('now') WHERE id = ?", [match.id]);
        await execute('INSERT INTO innings (match_id, batting_team, innings_number) VALUES (?, ?, 1)', [match.id, firstBattingTeam]);

        const updated = await queryOne('SELECT * FROM matches WHERE id = ?', [match.id]);
        const innings = await queryAll('SELECT * FROM innings WHERE match_id = ?', [match.id]);
        
        res.json({ ...updated, scorer_token: undefined, innings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/matches/:id/scorecard
router.get('/:id/scorecard', async (req, res) => {
    try {
        const match = await queryOne('SELECT * FROM matches WHERE id = ?', [Number(req.params.id)]);
        if (!match) return res.status(404).json({ error: 'Match not found' });

        const innings = await queryAll('SELECT * FROM innings WHERE match_id = ? ORDER BY innings_number', [match.id]);

        const scorecard = [];
        for (const inn of innings) {
            const deliveries = await queryAll('SELECT * FROM deliveries WHERE innings_id = ? ORDER BY id', [inn.id]);
            const batterMap = {};
            const batterOrder = [];
            
            deliveries.forEach(d => {
                if (!batterMap[d.batter_id]) {
                    batterMap[d.batter_id] = { player_id: d.batter_id, runs: 0, balls: 0, boundaries: 0, misses: 0 };
                    batterOrder.push(d.batter_id);
                }
                batterMap[d.batter_id].runs += d.runs_scored;
                if (!d.is_wide && !d.is_noball) batterMap[d.batter_id].balls++;
                if (d.is_boundary) batterMap[d.batter_id].boundaries++;
                if (d.is_miss) batterMap[d.batter_id].misses++;
            });

            const batters = [];
            for (const bid of batterOrder) {
                const b = batterMap[bid];
                const player = await queryOne('SELECT name FROM players WHERE id = ?', [bid]);
                b.name = player ? player.name : 'Unknown';
                
                const dismissal = await queryOne(`
                    SELECT dm.*, p.name as fielder_name, pb.name as bowler_name
                    FROM dismissals dm
                    LEFT JOIN players p ON dm.fielder_id = p.id
                    LEFT JOIN players pb ON dm.bowler_id = pb.id
                    WHERE dm.innings_id = ? AND dm.batter_id = ?
                `, [inn.id, bid]);

                b.dismissal = dismissal || null;
                b.is_out = !!dismissal;
                b.strike_rate = b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '0.0';
                batters.push(b);
            }

            // Bowling scorecard
            const bowlerMap = {};
            const bowlerOrder = [];
            deliveries.forEach(d => {
                if (!bowlerMap[d.bowler_id]) {
                    bowlerMap[d.bowler_id] = { player_id: d.bowler_id, legal_balls: 0, total_balls: 0, runs_conceded: 0, wickets: 0, wides: 0, noballs: 0 };
                    bowlerOrder.push(d.bowler_id);
                }
                const bw = bowlerMap[d.bowler_id];
                bw.total_balls++;
                bw.runs_conceded += d.runs_scored + d.extras_runs;
                if (d.is_wicket) bw.wickets++;
                if (d.is_wide) bw.wides++;
                if (d.is_noball) bw.noballs++;
                if (!d.is_wide && !d.is_noball) bw.legal_balls++;
            });

            const bowlers = [];
            for (const bid of bowlerOrder) {
                const b = bowlerMap[bid];
                const player = await queryOne('SELECT name FROM players WHERE id = ?', [bid]);
                b.name = player ? player.name : 'Unknown';
                b.overs = rules.formatOvers(b.legal_balls);
                b.economy = b.legal_balls > 0 ? ((b.runs_conceded / b.legal_balls) * 6).toFixed(2) : '0.00';
                bowlers.push(b);
            }

            // Fall of wickets
            const fow = await queryAll(`
                SELECT dm.id, p.name as batter_name, dm.dismissal_type, 
                       pf.name as fielder_name, pb.name as bowler_name,
                       del.over_number, del.ball_number, del.id as del_id
                FROM dismissals dm
                JOIN deliveries del ON dm.delivery_id = del.id
                JOIN players p ON dm.batter_id = p.id
                LEFT JOIN players pf ON dm.fielder_id = pf.id
                LEFT JOIN players pb ON dm.bowler_id = pb.id
                WHERE dm.innings_id = ?
                ORDER BY dm.id
            `, [inn.id]);

            for (const f of fow) {
                const scoreAtWicket = await queryOne(`
                    SELECT COALESCE(SUM(runs_scored + extras_runs), 0) as score 
                    FROM deliveries WHERE innings_id = ? AND id <= ?
                `, [inn.id, f.del_id]);
                f.team_score = scoreAtWicket ? scoreAtWicket.score : 0;
            }

            scorecard.push({ innings: inn, batters, bowlers, fallOfWickets: fow });
        }

        res.json({ match: { ...match, scorer_token: undefined }, scorecard });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/matches/:id/state
router.get('/:id/state', async (req, res) => {
    try {
        const match = await queryOne('SELECT * FROM matches WHERE id = ?', [Number(req.params.id)]);
        if (!match) return res.status(404).json({ error: 'Match not found' });

        const innings = await queryAll('SELECT * FROM innings WHERE match_id = ? ORDER BY innings_number', [match.id]);
        const currentInnings = innings.find(i => !i.is_completed) || innings[innings.length - 1];
        
        if (!currentInnings) return res.json({ match: { ...match, scorer_token: undefined }, innings: [], currentInnings: null, state: 'not_started' });

        const battingPlayers = await queryAll(`
            SELECT p.*, mp.batting_order FROM match_players mp 
            JOIN players p ON mp.player_id = p.id 
            WHERE mp.match_id = ? AND mp.team = ? ORDER BY mp.batting_order
        `, [match.id, currentInnings.batting_team]);

        const bowlingTeam = currentInnings.batting_team === 'A' ? 'B' : 'A';
        const bowlingPlayers = await queryAll(`
            SELECT p.*, mp.batting_order FROM match_players mp 
            JOIN players p ON mp.player_id = p.id 
            WHERE mp.match_id = ? AND mp.team = ? ORDER BY mp.batting_order
        `, [match.id, bowlingTeam]);

        const dismissed = (await queryAll('SELECT batter_id FROM dismissals WHERE innings_id = ?', [currentInnings.id])).map(d => d.batter_id);

        const lastDelivery = await queryOne('SELECT * FROM deliveries WHERE innings_id = ? ORDER BY id DESC LIMIT 1', [currentInnings.id]);

        const batterMisses = await queryAll('SELECT * FROM batter_misses WHERE innings_id = ?', [currentInnings.id]);

        let target = null;
        if (currentInnings.innings_number === 2 && innings.length > 1) {
            target = innings[0].total_runs + 1;
        }

        const currentOverNum = lastDelivery ? lastDelivery.over_number : 0;
        const currentOverBalls = await queryAll(`
            SELECT d.*, p.name as batter_name, pb.name as bowler_name
            FROM deliveries d
            JOIN players p ON d.batter_id = p.id
            JOIN players pb ON d.bowler_id = pb.id
            WHERE d.innings_id = ? AND d.over_number = ?
            ORDER BY d.id ASC
        `, [currentInnings.id, currentOverNum]);

        const isUnlimited = match.total_overs === 0;
        const totalBallsInMatch = isUnlimited ? 0 : match.total_overs * 6;
        const ballsRemaining = isUnlimited ? null : totalBallsInMatch - currentInnings.total_balls;
        const oversDisplay = isUnlimited ? `${rules.formatOvers(currentInnings.total_balls)} (∞)` : rules.formatOvers(currentInnings.total_balls);

        res.json({
            match: { ...match, scorer_token: undefined },
            innings,
            currentInnings,
            battingPlayers,
            bowlingPlayers,
            dismissed,
            lastDelivery,
            batterMisses,
            target,
            currentOverBalls,
            currentRunRate: rules.calculateCRR(currentInnings.total_runs, currentInnings.total_balls),
            requiredRunRate: (target && !isUnlimited) ? rules.calculateRRR(target, currentInnings.total_runs, ballsRemaining) : null,
            oversDisplay,
            isUnlimited
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/matches/:id/delivery — REQUIRES SCORER TOKEN
router.post('/:id/delivery', requireScorer, async (req, res) => {
    try {
        const match = await queryOne('SELECT * FROM matches WHERE id = ?', [Number(req.params.id)]);
        if (!match) return res.status(404).json({ error: 'Match not found' });
        if (match.status !== 'live') return res.status(400).json({ error: 'Match is not live' });

        const currentInnings = await queryOne("SELECT * FROM innings WHERE match_id = ? AND is_completed = 0 ORDER BY innings_number LIMIT 1", [match.id]);
        if (!currentInnings) return res.status(400).json({ error: 'No active innings' });

        const {
            batter_id, bowler_id,
            runs_scored = 0, is_wide = false, is_noball = false,
            is_bye = false, is_wicket = false, is_miss = false,
            dismissal_type, fielder_id
        } = req.body;

        if (!batter_id || !bowler_id) {
            return res.status(400).json({ error: 'Batter and bowler are required' });
        }

        const validatedRuns = rules.validateRuns(runs_scored);
        const isBoundary = validatedRuns === 2;
        const isLegal = !is_wide && !is_noball;
        const extrasRuns = 0; // Corridor rule: no runs for wides/no balls

        const legalBallsBefore = currentInnings.total_balls;
        const overNumber = Math.floor(legalBallsBefore / 6);
        const ballInOver = isLegal ? (legalBallsBefore % 6) + 1 : legalBallsBefore % 6;

        // Handle miss tracking
        let missCount = 0;
        let autoThreeMissOut = false;
        if (is_miss && !is_wicket) {
            const existing = await queryOne('SELECT * FROM batter_misses WHERE innings_id = ? AND batter_id = ?', [currentInnings.id, batter_id]);
            if (existing) {
                const result = rules.processMiss(existing.miss_count);
                missCount = result.missCount;
                autoThreeMissOut = result.isOut;
                await execute('UPDATE batter_misses SET miss_count = ? WHERE id = ?', [missCount, existing.id]);
            } else {
                missCount = 1;
                await execute('INSERT INTO batter_misses (innings_id, batter_id, miss_count) VALUES (?, ?, 1)', [currentInnings.id, batter_id]);
            }
        }

        const actualWicket = is_wicket || autoThreeMissOut;
        const actualDismissalType = autoThreeMissOut ? 'three_misses' : dismissal_type;

        const batterPlayer = await queryOne('SELECT name FROM players WHERE id = ?', [batter_id]);
        const bowlerPlayer = await queryOne('SELECT name FROM players WHERE id = ?', [bowler_id]);
        const fielderPlayer = fielder_id ? await queryOne('SELECT name FROM players WHERE id = ?', [fielder_id]) : null;

        const commentaryText = commentary.generateCommentary(
            { runs_scored: validatedRuns, is_wide, is_noball, is_bye, is_wicket: actualWicket, is_miss, is_boundary: isBoundary },
            { batterName: batterPlayer?.name, bowlerName: bowlerPlayer?.name, fielderName: fielderPlayer?.name, dismissalType: actualDismissalType, missCount }
        );

        const deliveryResult = await execute(`
            INSERT INTO deliveries (
                innings_id, over_number, ball_number, bowler_id, batter_id, non_striker_id,
                runs_scored, extras_runs, is_wide, is_noball, is_bye, is_wicket, is_miss, is_boundary, commentary
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            currentInnings.id, overNumber, ballInOver, bowler_id, batter_id, null,
            validatedRuns, extrasRuns, is_wide ? 1 : 0, is_noball ? 1 : 0, is_bye ? 1 : 0,
            actualWicket ? 1 : 0, is_miss ? 1 : 0, isBoundary ? 1 : 0, commentaryText
        ]);

        if (actualWicket && actualDismissalType) {
            await execute(`
                INSERT INTO dismissals (delivery_id, innings_id, batter_id, bowler_id, fielder_id, dismissal_type)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [deliveryResult.lastInsertRowid, currentInnings.id, batter_id, bowler_id, fielder_id || null, actualDismissalType]);
        }

        const totalRuns = validatedRuns + extrasRuns;
        const newBalls = isLegal ? currentInnings.total_balls + 1 : currentInnings.total_balls;
        const newWickets = actualWicket ? currentInnings.total_wickets + 1 : currentInnings.total_wickets;
        const newRuns = currentInnings.total_runs + totalRuns;
        const newExtras = currentInnings.extras + extrasRuns;

        await execute('UPDATE innings SET total_runs = ?, total_wickets = ?, total_balls = ?, extras = ? WHERE id = ?',
            [newRuns, newWickets, newBalls, newExtras, currentInnings.id]);

        const tpc = await queryOne("SELECT COUNT(*) as cnt FROM match_players WHERE match_id = ? AND team = ?", [match.id, currentInnings.batting_team]);
        const teamPlayerCount = tpc.cnt;

        const updatedInnings = { ...currentInnings, total_runs: newRuns, total_wickets: newWickets, total_balls: newBalls };
        let inningsComplete = rules.isInningsComplete(updatedInnings, match.total_overs, teamPlayerCount);

        const allInnings = await queryAll('SELECT * FROM innings WHERE match_id = ? ORDER BY innings_number', [match.id]);
        let matchComplete = false;
        if (currentInnings.innings_number === 2 && allInnings.length > 1) {
            const tgt = allInnings[0].total_runs + 1;
            if (newRuns >= tgt) {
                inningsComplete = true;
                matchComplete = true;
            }
        }

        if (inningsComplete) {
            await execute('UPDATE innings SET is_completed = 1 WHERE id = ?', [currentInnings.id]);

            if (currentInnings.innings_number === 1 && !matchComplete) {
                const secondBattingTeam = currentInnings.batting_team === 'A' ? 'B' : 'A';
                await execute('INSERT INTO innings (match_id, batting_team, innings_number) VALUES (?, ?, 2)', [match.id, secondBattingTeam]);
            } else {
                matchComplete = true;
            }
        }

        if (matchComplete) {
            const finalInnings = await queryAll('SELECT * FROM innings WHERE match_id = ? ORDER BY innings_number', [match.id]);
            match._teamPlayerCount = teamPlayerCount;
            const result = rules.determineResult(match, finalInnings[0], finalInnings[1] || updatedInnings);
            await execute("UPDATE matches SET status = 'completed', result = ?, completed_at = datetime('now') WHERE id = ?", [result, match.id]);
        }

        const updatedMatch = await queryOne('SELECT * FROM matches WHERE id = ?', [match.id]);
        const updatedAllInnings = await queryAll('SELECT * FROM innings WHERE match_id = ? ORDER BY innings_number', [match.id]);
        const activeInnings = updatedAllInnings.find(i => !i.is_completed) || updatedAllInnings[updatedAllInnings.length - 1];

        const response = {
            delivery: {
                id: deliveryResult.lastInsertRowid,
                runs_scored: validatedRuns,
                extras_runs: extrasRuns,
                is_wide,
                is_noball,
                is_wicket: actualWicket,
                is_miss,
                is_boundary: isBoundary,
                commentary: commentaryText,
                dismissal_type: actualDismissalType || null,
                miss_count: missCount
            },
            match: { ...updatedMatch, scorer_token: undefined },
            innings: updatedAllInnings,
            currentInnings: activeInnings,
            inningsComplete,
            matchComplete,
            oversDisplay: rules.formatOvers(activeInnings.total_balls)
        };

        const io = req.app.get('io');
        if (io) io.to(`match-${match.id}`).emit('score-update', response);

        res.json(response);
    } catch (err) {
        console.error('Delivery error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/matches/:id/undo — REQUIRES SCORER TOKEN
router.post('/:id/undo', requireScorer, async (req, res) => {
    try {
        const match = await queryOne('SELECT * FROM matches WHERE id = ?', [Number(req.params.id)]);
        if (!match) return res.status(404).json({ error: 'Match not found' });

        let currentInnings = await queryOne('SELECT * FROM innings WHERE match_id = ? ORDER BY innings_number DESC LIMIT 1', [match.id]);
        if (!currentInnings) return res.status(400).json({ error: 'No innings to undo' });

        const lastDelivery = await queryOne('SELECT * FROM deliveries WHERE innings_id = ? ORDER BY id DESC LIMIT 1', [currentInnings.id]);
        if (!lastDelivery) {
            if (currentInnings.innings_number === 2) {
                await execute('DELETE FROM innings WHERE id = ?', [currentInnings.id]);
                const firstInnings = await queryOne("SELECT * FROM innings WHERE match_id = ? AND innings_number = 1", [match.id]);
                if (firstInnings) await execute('UPDATE innings SET is_completed = 0 WHERE id = ?', [firstInnings.id]);
                await execute("UPDATE matches SET status = 'live', result = NULL, completed_at = NULL WHERE id = ?", [match.id]);
                return res.json({ success: true, message: 'Rolled back to first innings' });
            }
            return res.status(400).json({ error: 'No deliveries to undo' });
        }

        if (lastDelivery.is_wicket) {
            const dismissal = await queryOne('SELECT * FROM dismissals WHERE delivery_id = ?', [lastDelivery.id]);
            if (dismissal) {
                if (dismissal.dismissal_type === 'three_misses') {
                    await execute('UPDATE batter_misses SET miss_count = MAX(0, miss_count - 1) WHERE innings_id = ? AND batter_id = ?', [currentInnings.id, lastDelivery.batter_id]);
                }
                await execute('DELETE FROM dismissals WHERE delivery_id = ?', [lastDelivery.id]);
            }
        } else if (lastDelivery.is_miss) {
            await execute('UPDATE batter_misses SET miss_count = MAX(0, miss_count - 1) WHERE innings_id = ? AND batter_id = ?', [currentInnings.id, lastDelivery.batter_id]);
        }

        const isLegal = !lastDelivery.is_wide && !lastDelivery.is_noball;
        const totalRuns = lastDelivery.runs_scored + lastDelivery.extras_runs;
        
        const newRuns = Math.max(0, currentInnings.total_runs - totalRuns);
        const newWickets = Math.max(0, currentInnings.total_wickets - (lastDelivery.is_wicket ? 1 : 0));
        const newBalls = Math.max(0, currentInnings.total_balls - (isLegal ? 1 : 0));
        const newExtras = Math.max(0, currentInnings.extras - lastDelivery.extras_runs);

        await execute('UPDATE innings SET total_runs = ?, total_wickets = ?, total_balls = ?, extras = ?, is_completed = 0 WHERE id = ?',
            [newRuns, newWickets, newBalls, newExtras, currentInnings.id]);

        await execute('DELETE FROM deliveries WHERE id = ?', [lastDelivery.id]);

        if (match.status === 'completed') {
            await execute("UPDATE matches SET status = 'live', result = NULL, completed_at = NULL WHERE id = ?", [match.id]);
        }

        const io = req.app.get('io');
        if (io) io.to(`match-${match.id}`).emit('undo', { matchId: match.id });

        res.json({ success: true, message: 'Last delivery undone' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/matches/:id/commentary
router.get('/:id/commentary', async (req, res) => {
    try {
        const innings = await queryAll('SELECT * FROM innings WHERE match_id = ? ORDER BY innings_number', [Number(req.params.id)]);
        const allCommentary = [];
        for (const inn of innings) {
            const deliveries = await queryAll(`
                SELECT d.*, p.name as batter_name, pb.name as bowler_name
                FROM deliveries d
                JOIN players p ON d.batter_id = p.id
                JOIN players pb ON d.bowler_id = pb.id
                WHERE d.innings_id = ?
                ORDER BY d.id DESC
            `, [inn.id]);
            allCommentary.push({ innings_number: inn.innings_number, batting_team: inn.batting_team, deliveries });
        }
        res.json(allCommentary);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/matches/:id/graph-data
router.get('/:id/graph-data', async (req, res) => {
    try {
        const match = await queryOne('SELECT * FROM matches WHERE id = ?', [Number(req.params.id)]);
        const innings = await queryAll('SELECT * FROM innings WHERE match_id = ? ORDER BY innings_number', [match.id]);

        const graphData = [];
        for (const inn of innings) {
            const deliveries = await queryAll('SELECT * FROM deliveries WHERE innings_id = ? ORDER BY id', [inn.id]);

            const overMap = {};
            deliveries.forEach(d => {
                if (!overMap[d.over_number]) overMap[d.over_number] = { runs: 0, wickets: 0 };
                overMap[d.over_number].runs += d.runs_scored + d.extras_runs;
                if (d.is_wicket) overMap[d.over_number].wickets++;
            });
            const runsPerOver = Object.entries(overMap).map(([o, data]) => ({ over_number: Number(o), ...data }));

            let cumRuns = 0, lBalls = 0;
            const runRateProgression = [];
            deliveries.forEach(d => {
                cumRuns += d.runs_scored + d.extras_runs;
                if (!d.is_wide && !d.is_noball) lBalls++;
                if (lBalls > 0) {
                    runRateProgression.push({
                        ball: lBalls,
                        over: rules.formatOvers(lBalls),
                        runRate: ((cumRuns / lBalls) * 6).toFixed(2),
                        totalRuns: cumRuns
                    });
                }
            });

            const partnerships = [];
            let pRuns = 0, pBalls = 0, p1 = null;
            const allDels = await queryAll(`
                SELECT d.*, p.name as batter_name
                FROM deliveries d 
                JOIN players p ON d.batter_id = p.id
                WHERE d.innings_id = ? ORDER BY d.id
            `, [inn.id]);

            allDels.forEach(d => {
                if (!p1) { p1 = d.batter_name; }
                pRuns += d.runs_scored;
                pBalls++;
                if (d.is_wicket) {
                    partnerships.push({ batter1: p1, batter2: '-', runs: pRuns, balls: pBalls });
                    pRuns = 0; pBalls = 0; p1 = null;
                }
            });
            if (pRuns > 0 || pBalls > 0) {
                partnerships.push({ batter1: p1 || 'Unknown', batter2: '-', runs: pRuns, balls: pBalls, current: true });
            }

            const teamName = inn.batting_team === 'A' ? match.team_a_name : match.team_b_name;
            graphData.push({ innings_number: inn.innings_number, batting_team: teamName, runsPerOver, runRateProgression, partnerships });
        }

        res.json(graphData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/matches/:id/complete
router.put('/:id/complete', requireScorer, async (req, res) => {
    try {
        const { result } = req.body;
        await execute("UPDATE matches SET status = 'completed', result = ?, completed_at = datetime('now') WHERE id = ?",
            [result || 'Match ended', Number(req.params.id)]);
        await execute('UPDATE innings SET is_completed = 1 WHERE match_id = ?', [Number(req.params.id)]);
        
        const io = req.app.get('io');
        if (io) io.to(`match-${req.params.id}`).emit('match-complete', { matchId: req.params.id, result });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/matches/:id/end-innings
router.put('/:id/end-innings', requireScorer, async (req, res) => {
    try {
        const match = await queryOne('SELECT * FROM matches WHERE id = ?', [Number(req.params.id)]);
        const currentInnings = await queryOne("SELECT * FROM innings WHERE match_id = ? AND is_completed = 0 ORDER BY innings_number LIMIT 1", [match.id]);
        if (!currentInnings) return res.status(400).json({ error: 'No active innings' });

        await execute('UPDATE innings SET is_completed = 1 WHERE id = ?', [currentInnings.id]);

        if (currentInnings.innings_number === 1) {
            const secondBattingTeam = currentInnings.batting_team === 'A' ? 'B' : 'A';
            await execute('INSERT INTO innings (match_id, batting_team, innings_number) VALUES (?, ?, 2)', [match.id, secondBattingTeam]);
            const io = req.app.get('io');
            if (io) io.to(`match-${match.id}`).emit('innings-change', { matchId: match.id });
            res.json({ success: true, message: 'First innings ended, second innings started' });
        } else {
            const allInnings = await queryAll('SELECT * FROM innings WHERE match_id = ? ORDER BY innings_number', [match.id]);
            const tpc = await queryOne("SELECT COUNT(*) as cnt FROM match_players WHERE match_id = ? AND team = ?", [match.id, currentInnings.batting_team]);
            match._teamPlayerCount = tpc.cnt;
            const result = rules.determineResult(match, allInnings[0], allInnings[1]);
            await execute("UPDATE matches SET status = 'completed', result = ?, completed_at = datetime('now') WHERE id = ?", [result, match.id]);
            const io = req.app.get('io');
            if (io) io.to(`match-${match.id}`).emit('match-complete', { matchId: match.id, result });
            res.json({ success: true, message: result });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/matches/:id/check-scorer
router.get('/:id/check-scorer', async (req, res) => {
    try {
        const match = await queryOne('SELECT scorer_token FROM matches WHERE id = ?', [Number(req.params.id)]);
        if (!match) return res.status(404).json({ error: 'Match not found' });
        const token = req.headers['x-scorer-token'];
        res.json({ isScorer: !match.scorer_token || token === match.scorer_token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/matches/:id
router.delete('/:id', async (req, res) => {
    try {
        await execute('DELETE FROM deliveries WHERE innings_id IN (SELECT id FROM innings WHERE match_id = ?)', [Number(req.params.id)]);
        await execute('DELETE FROM dismissals WHERE innings_id IN (SELECT id FROM innings WHERE match_id = ?)', [Number(req.params.id)]);
        await execute('DELETE FROM batter_misses WHERE innings_id IN (SELECT id FROM innings WHERE match_id = ?)', [Number(req.params.id)]);
        await execute('DELETE FROM innings WHERE match_id = ?', [Number(req.params.id)]);
        await execute('DELETE FROM match_players WHERE match_id = ?', [Number(req.params.id)]);
        await execute('DELETE FROM matches WHERE id = ?', [Number(req.params.id)]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
