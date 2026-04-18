/**
 * Corridor Cricket — Scoring Panel Logic
 * Single batter at a time (no non-striker in corridor cricket)
 */

let matchId = null;
let matchState = null;
let socket = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const params = new URLSearchParams(window.location.search);
        matchId = params.get('id');
        if (!matchId) {
            document.getElementById('scoring-loading').classList.add('hidden');
            alert('No match ID specified!');
            return;
        }

        // Set links safely
        const wl = document.getElementById('watch-link');
        if (wl) wl.href = '/match?id=' + matchId;
        const si = document.getElementById('spectate-instead');
        if (si) si.href = '/match?id=' + matchId;
        const vl = document.getElementById('view-scorecard-link');
        if (vl) vl.href = '/match?id=' + matchId;

        // Socket.io — non-blocking
        try {
            if (typeof io !== 'undefined') {
                socket = io();
                socket.emit('join-match', matchId);
            }
        } catch(e) {
            console.warn('Socket.io failed:', e);
        }

        // Load the match data
        await loadMatchState();
    } catch (err) {
        console.error('DOMContentLoaded error:', err);
        document.getElementById('scoring-loading').classList.add('hidden');
        document.getElementById('scoring-content').classList.add('hidden');
        alert('Error loading scoring page: ' + err.message);
    }
});

function getScorerToken() {
    return localStorage.getItem('scorer-token-' + matchId);
}

function scorerHeaders() {
    const token = getScorerToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['X-Scorer-Token'] = token;
    return headers;
}

async function loadMatchState() {
    const loadingEl = document.getElementById('scoring-loading');
    try {
        const res = await fetch('/api/matches/' + matchId + '/state');
        if (!res.ok) {
            throw new Error('API returned ' + res.status);
        }
        const data = await res.json();
        matchState = data;

        // Hide loading
        loadingEl.classList.add('hidden');

        if (!data || !data.match) {
            alert('No match data received');
            return;
        }

        if (data.match.status === 'completed') {
            document.getElementById('match-completed').classList.remove('hidden');
            const cr = document.getElementById('completed-result');
            if (cr) cr.textContent = data.match.result || 'Match completed';
            return;
        }

        if (data.match.status === 'upcoming' || !data.currentInnings) {
            document.getElementById('match-not-started').classList.remove('hidden');
            return;
        }

        document.getElementById('scoring-content').classList.remove('hidden');
        renderState(data);
    } catch (err) {
        console.error('loadMatchState error:', err);
        loadingEl.classList.add('hidden');
        alert('Failed to load match: ' + err.message);
    }
}

function renderState(data) {
    const m = data.match;
    const innings = data.innings;
    const ci = data.currentInnings;

    let teamAScore = '-', teamBScore = '-';
    if (innings && Array.isArray(innings)) {
        innings.forEach(function(i) {
            var display = i.total_runs + '/' + i.total_wickets;
            if (i.batting_team === 'A') teamAScore = display;
            else teamBScore = display;
        });
    }

    var oversA = ci.batting_team === 'A' ? '<div class="text-sm text-muted">(' + (data.oversDisplay || '') + ' ov)</div>' : '';
    var oversB = ci.batting_team === 'B' ? '<div class="text-sm text-muted">(' + (data.oversDisplay || '') + ' ov)</div>' : '';

    document.getElementById('scoring-score-display').innerHTML =
        '<div class="team-score">' +
            '<div class="team-name">' + m.team_a_name + '</div>' +
            '<div class="score-big">' + teamAScore + '</div>' +
            oversA +
        '</div>' +
        '<div class="vs-divider">vs</div>' +
        '<div class="team-score">' +
            '<div class="team-name">' + m.team_b_name + '</div>' +
            '<div class="score-big">' + teamBScore + '</div>' +
            oversB +
        '</div>';

    // Target
    if (data.target) {
        var el = document.getElementById('scoring-target');
        var needed = data.target - ci.total_runs;
        el.textContent = needed > 0 ? 'Need ' + needed + ' run' + (needed !== 1 ? 's' : '') + ' to win' : 'Target achieved!';
        el.classList.remove('hidden');
    }

    // Overs
    var isUnlimited = data.isUnlimited || m.total_overs === 0;
    document.getElementById('over-count').textContent =
        'Over: ' + (data.oversDisplay || '0.0') + (isUnlimited ? '' : ' / ' + m.total_overs) + ' • Innings ' + ci.innings_number;

    // Populate batter dropdown
    var strikerSelect = document.getElementById('striker-select');
    var currentStriker = strikerSelect.value;
    strikerSelect.innerHTML = '';

    if (data.battingPlayers && Array.isArray(data.battingPlayers)) {
        var dismissed = data.dismissed || [];
        data.battingPlayers.forEach(function(p) {
            if (dismissed.indexOf(p.id) === -1) {
                var opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                strikerSelect.appendChild(opt);
            }
        });
    }
    if (currentStriker && strikerSelect.querySelector('option[value="' + currentStriker + '"]')) {
        strikerSelect.value = currentStriker;
    }

    // Batter stats & misses
    updateBatterStats(data);
    strikerSelect.onchange = function() { updateBatterStats(data); };

    // Populate bowler dropdown
    var bowlerSelect = document.getElementById('bowler-select');
    var currentBowler = bowlerSelect.value;
    bowlerSelect.innerHTML = '';
    if (data.bowlingPlayers && Array.isArray(data.bowlingPlayers)) {
        data.bowlingPlayers.forEach(function(p) {
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            bowlerSelect.appendChild(opt);
        });
    }
    if (currentBowler && bowlerSelect.querySelector('option[value="' + currentBowler + '"]')) {
        bowlerSelect.value = currentBowler;
    }

    // Populate fielder dropdown in wicket modal
    var fielderSelect = document.getElementById('fielder-select');
    if (fielderSelect) {
        fielderSelect.innerHTML = '<option value="">Select fielder (optional)</option>';
        if (data.bowlingPlayers && Array.isArray(data.bowlingPlayers)) {
            data.bowlingPlayers.forEach(function(p) {
                var opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                fielderSelect.appendChild(opt);
            });
        }
    }

    // Over timeline
    renderOverTimeline(data.currentOverBalls);
}

function updateBatterStats(data) {
    var batterId = Number(document.getElementById('striker-select').value);
    var misses = data.batterMisses || [];
    var miss = null;
    for (var i = 0; i < misses.length; i++) {
        if (misses[i].batter_id === batterId) { miss = misses[i]; break; }
    }
    var missCount = miss ? miss.miss_count : 0;

    document.getElementById('striker-stats').textContent = missCount + '/3 misses';
    document.getElementById('striker-misses').innerHTML = [0, 1, 2].map(function(i) {
        return '<span class="miss-dot ' + (i < missCount ? 'active' : '') + '"></span>';
    }).join('');
}

function renderOverTimeline(balls) {
    var container = document.getElementById('scoring-over-timeline');
    if (!balls || balls.length === 0) {
        container.innerHTML = '<span class="text-muted">New over</span>';
        return;
    }
    container.innerHTML = balls.map(function(b) {
        var cls = 'ball-dot ';
        var text = '';
        if (b.is_wicket) { cls += 'wicket'; text = 'W'; }
        else if (b.is_miss) { cls += 'miss'; text = 'M'; }
        else if (b.is_wide) { cls += 'wide'; text = 'Wd'; }
        else if (b.is_noball) { cls += 'noball'; text = 'Nb'; }
        else if (b.is_boundary) { cls += 'boundary'; text = b.runs_scored; }
        else if (b.runs_scored === 0) { cls += 'dot'; text = '•'; }
        else { cls += 'runs'; text = b.runs_scored; }
        return '<span class="' + cls + '">' + text + '</span>';
    }).join('');
}

async function recordDelivery(runs) {
    var batter_id = Number(document.getElementById('striker-select').value);
    var bowler_id = Number(document.getElementById('bowler-select').value);
    if (!batter_id || !bowler_id) return showToast('Select batter and bowler', 'error');

    try {
        var res = await fetch('/api/matches/' + matchId + '/delivery', {
            method: 'POST',
            headers: scorerHeaders(),
            body: JSON.stringify({ batter_id: batter_id, bowler_id: bowler_id, runs_scored: runs })
        });
        var data = await res.json();
        if (!res.ok) return showToast(data.error, 'error');
        handleDeliveryResponse(data);
    } catch (err) {
        showToast('Network error', 'error');
    }
}

async function recordMiss() {
    var batter_id = Number(document.getElementById('striker-select').value);
    var bowler_id = Number(document.getElementById('bowler-select').value);
    if (!batter_id || !bowler_id) return showToast('Select batter and bowler', 'error');

    try {
        var res = await fetch('/api/matches/' + matchId + '/delivery', {
            method: 'POST',
            headers: scorerHeaders(),
            body: JSON.stringify({ batter_id: batter_id, bowler_id: bowler_id, runs_scored: 0, is_miss: true })
        });
        var data = await res.json();
        if (!res.ok) return showToast(data.error, 'error');
        handleDeliveryResponse(data);
    } catch (err) {
        showToast('Network error', 'error');
    }
}

async function recordExtra(type) {
    var batter_id = Number(document.getElementById('striker-select').value);
    var bowler_id = Number(document.getElementById('bowler-select').value);
    if (!batter_id || !bowler_id) return showToast('Select batter and bowler', 'error');

    try {
        var body = { batter_id: batter_id, bowler_id: bowler_id, runs_scored: 0 };
        if (type === 'wide') body.is_wide = true;
        if (type === 'noball') body.is_noball = true;

        var res = await fetch('/api/matches/' + matchId + '/delivery', {
            method: 'POST',
            headers: scorerHeaders(),
            body: JSON.stringify(body)
        });
        var data = await res.json();
        if (!res.ok) return showToast(data.error, 'error');
        handleDeliveryResponse(data);
    } catch (err) {
        showToast('Network error', 'error');
    }
}

function showWicketModal() {
    document.getElementById('wicket-modal').classList.add('active');
    var dismissalType = document.getElementById('dismissal-type');
    dismissalType.onchange = function() {
        var needsFielder = ['caught_one_hand', 'run_out', 'stumped'].indexOf(dismissalType.value) !== -1;
        document.getElementById('fielder-group').style.display = needsFielder ? 'block' : 'none';
    };
    dismissalType.dispatchEvent(new Event('change'));
}

async function confirmWicket() {
    var batter_id = Number(document.getElementById('striker-select').value);
    var bowler_id = Number(document.getElementById('bowler-select').value);
    var dismissal_type = document.getElementById('dismissal-type').value;
    var fielder_id = Number(document.getElementById('fielder-select').value) || null;
    var runs_scored = Number(document.getElementById('wicket-runs').value) || 0;
    if (!batter_id || !bowler_id) return showToast('Select batter and bowler', 'error');

    try {
        var res = await fetch('/api/matches/' + matchId + '/delivery', {
            method: 'POST',
            headers: scorerHeaders(),
            body: JSON.stringify({ batter_id: batter_id, bowler_id: bowler_id, runs_scored: runs_scored, is_wicket: true, dismissal_type: dismissal_type, fielder_id: fielder_id })
        });
        var data = await res.json();
        if (!res.ok) return showToast(data.error, 'error');
        closeModal('wicket-modal');
        handleDeliveryResponse(data);
    } catch (err) {
        showToast('Network error', 'error');
    }
}

function handleDeliveryResponse(data) {
    if (data.delivery && data.delivery.commentary) {
        document.getElementById('last-ball-card').style.display = 'block';
        document.getElementById('last-ball-commentary').textContent = data.delivery.commentary;
    }
    if (data.matchComplete) {
        showToast('🏆 Match Complete!', 'success');
        setTimeout(function() { window.location.href = '/match?id=' + matchId; }, 1500);
        return;
    }
    if (data.inningsComplete) {
        showToast('📋 Innings Complete! Starting next innings...', 'info');
    }
    loadMatchState();
}

async function undoDelivery() {
    if (!confirm('Undo the last delivery?')) return;
    try {
        var res = await fetch('/api/matches/' + matchId + '/undo', {
            method: 'POST', headers: scorerHeaders()
        });
        var data = await res.json();
        if (!res.ok) return showToast(data.error, 'error');
        showToast('✅ Last ball undone', 'success');
        loadMatchState();
    } catch (err) {
        showToast('Network error', 'error');
    }
}

async function confirmEndInnings() {
    if (!confirm('End the current innings?')) return;
    try {
        var res = await fetch('/api/matches/' + matchId + '/end-innings', {
            method: 'PUT', headers: scorerHeaders()
        });
        var data = await res.json();
        if (!res.ok) return showToast(data.error, 'error');
        showToast(data.message, 'success');
        loadMatchState();
    } catch (err) {
        showToast('Network error', 'error');
    }
}

async function confirmEndMatch() {
    if (!confirm('End this match? This will finalize the result.')) return;
    try {
        var res = await fetch('/api/matches/' + matchId + '/complete', {
            method: 'PUT', headers: scorerHeaders(),
            body: JSON.stringify({ result: 'Match ended' })
        });
        var data = await res.json();
        if (!res.ok) return showToast(data.error, 'error');
        showToast('Match ended!', 'success');
        setTimeout(function() { location.reload(); }, 1000);
    } catch (err) {
        showToast('Network error', 'error');
    }
}

async function startMatch() {
    try {
        var res = await fetch('/api/matches/' + matchId + '/start', {
            method: 'PUT', headers: scorerHeaders()
        });
        var data = await res.json();
        if (!res.ok) return showToast(data.error, 'error');
        showToast('Match started! 🏏', 'success');
        location.reload();
    } catch (err) {
        showToast('Network error', 'error');
    }
}
