/**
 * Corridor Cricket — Scoring Panel Logic
 * Single batter at a time (no non-striker in corridor cricket)
 * Only the match creator (scorer) can record deliveries
 */

let matchId = null;
let matchState = null;
let socket = null;

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    matchId = params.get('id');
    if (!matchId) return showToast('No match ID specified!', 'error');

    // Set links
    document.getElementById('watch-link').href = `/match?id=${matchId}`;
    document.getElementById('spectate-instead').href = `/match?id=${matchId}`;
    document.getElementById('view-scorecard-link').href = `/match?id=${matchId}`;

    socket = io();
    socket.emit('join-match', matchId);

    checkScorerAuth();
});

function getScorerToken() {
    return localStorage.getItem(`scorer-token-${matchId}`);
}

function scorerHeaders() {
    const token = getScorerToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['X-Scorer-Token'] = token;
    return headers;
}

async function checkScorerAuth() {
    // Direct load - no auth blocking. Anyone with the scoring link can score.
    // The match view page (/match?id=X) is the read-only spectator page.
    try {
        await loadMatchState();
    } catch (err) {
        console.error('Load error:', err);
        document.getElementById('scoring-loading').classList.add('hidden');
        showToast('Cannot load match. Check your connection.', 'error');
    }
}

async function loadMatchState() {
    try {
        const res = await fetch(`/api/matches/${matchId}/state`);
        const data = await res.json();
        matchState = data;

        document.getElementById('scoring-loading').classList.add('hidden');

        if (data.match.status === 'completed') {
            document.getElementById('match-completed').classList.remove('hidden');
            document.getElementById('completed-result').textContent = data.match.result;
            return;
        }

        if (data.match.status === 'upcoming' || !data.currentInnings) {
            document.getElementById('match-not-started').classList.remove('hidden');
            return;
        }

        document.getElementById('scoring-content').classList.remove('hidden');
        renderState(data);
    } catch (err) {
        showToast('Error loading match', 'error');
    }
}

function renderState(data) {
    // Score display
    const m = data.match;
    const innings = data.innings;
    const ci = data.currentInnings;
    
    let teamAScore = '-', teamBScore = '-';
    innings.forEach(i => {
        const display = `${i.total_runs}/${i.total_wickets}`;
        if (i.batting_team === 'A') teamAScore = display;
        else teamBScore = display;
    });

    document.getElementById('scoring-score-display').innerHTML = `
        <div class="team-score">
            <div class="team-name">${m.team_a_name}</div>
            <div class="score-big">${teamAScore}</div>
            ${ci.batting_team === 'A' ? `<div class="text-sm text-muted">(${data.oversDisplay} ov)</div>` : ''}
        </div>
        <div class="vs-divider">vs</div>
        <div class="team-score">
            <div class="team-name">${m.team_b_name}</div>
            <div class="score-big">${teamBScore}</div>
            ${ci.batting_team === 'B' ? `<div class="text-sm text-muted">(${data.oversDisplay} ov)</div>` : ''}
        </div>
    `;

    // Target
    if (data.target) {
        const el = document.getElementById('scoring-target');
        const needed = data.target - ci.total_runs;
        el.textContent = needed > 0 ? `Need ${needed} run${needed !== 1 ? 's' : ''} to win` : 'Target achieved!';
        el.classList.remove('hidden');
    }

    // Overs
    const isUnlimited = data.isUnlimited || m.total_overs === 0;
    document.getElementById('over-count').textContent = `Over: ${data.oversDisplay}${isUnlimited ? '' : ' / ' + m.total_overs} • Innings ${ci.innings_number}`;

    // Populate batter dropdown
    const strikerSelect = document.getElementById('striker-select');
    const currentStriker = strikerSelect.value;
    strikerSelect.innerHTML = '';
    
    data.battingPlayers.forEach(p => {
        if (!data.dismissed.includes(p.id)) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            strikerSelect.appendChild(opt);
        }
    });
    if (currentStriker && strikerSelect.querySelector(`option[value="${currentStriker}"]`)) {
        strikerSelect.value = currentStriker;
    }

    // Batter stats & misses
    updateBatterStats(data);

    strikerSelect.onchange = () => updateBatterStats(data);

    // Populate bowler dropdown
    const bowlerSelect = document.getElementById('bowler-select');
    const currentBowler = bowlerSelect.value;
    bowlerSelect.innerHTML = '';
    data.bowlingPlayers.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        bowlerSelect.appendChild(opt);
    });
    if (currentBowler && bowlerSelect.querySelector(`option[value="${currentBowler}"]`)) {
        bowlerSelect.value = currentBowler;
    }

    // Populate fielder dropdown in wicket modal
    const fielderSelect = document.getElementById('fielder-select');
    fielderSelect.innerHTML = '<option value="">Select fielder (optional)</option>';
    data.bowlingPlayers.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        fielderSelect.appendChild(opt);
    });

    // Over timeline
    renderOverTimeline(data.currentOverBalls);
}

function updateBatterStats(data) {
    const batterId = Number(document.getElementById('striker-select').value);
    const miss = data.batterMisses.find(m => m.batter_id === batterId);
    const missCount = miss ? miss.miss_count : 0;

    document.getElementById('striker-stats').textContent = `${missCount}/3 misses`;
    document.getElementById('striker-misses').innerHTML = [0, 1, 2].map(i =>
        `<span class="miss-dot ${i < missCount ? 'active' : ''}"></span>`
    ).join('');
}

function renderOverTimeline(balls) {
    const container = document.getElementById('scoring-over-timeline');
    if (!balls || balls.length === 0) {
        container.innerHTML = '<span class="text-muted">New over</span>';
        return;
    }
    container.innerHTML = balls.map(b => {
        let cls = 'ball-dot ';
        let text = '';
        if (b.is_wicket) { cls += 'wicket'; text = 'W'; }
        else if (b.is_miss) { cls += 'miss'; text = 'M'; }
        else if (b.is_wide) { cls += 'wide'; text = 'Wd'; }
        else if (b.is_noball) { cls += 'noball'; text = 'Nb'; }
        else if (b.is_boundary) { cls += 'boundary'; text = b.runs_scored; }
        else if (b.runs_scored === 0) { cls += 'dot'; text = '•'; }
        else { cls += 'runs'; text = b.runs_scored; }
        return `<span class="${cls}">${text}</span>`;
    }).join('');
}

async function recordDelivery(runs) {
    const batter_id = Number(document.getElementById('striker-select').value);
    const bowler_id = Number(document.getElementById('bowler-select').value);

    if (!batter_id || !bowler_id) return showToast('Select batter and bowler', 'error');

    try {
        const res = await fetch(`/api/matches/${matchId}/delivery`, {
            method: 'POST',
            headers: scorerHeaders(),
            body: JSON.stringify({ batter_id, bowler_id, runs_scored: runs })
        });

        if (res.status === 403) return showToast('Only the scorer can record deliveries', 'error');
        const data = await res.json();
        if (!res.ok) return showToast(data.error, 'error');

        handleDeliveryResponse(data);
    } catch (err) {
        showToast('Network error', 'error');
    }
}

async function recordMiss() {
    const batter_id = Number(document.getElementById('striker-select').value);
    const bowler_id = Number(document.getElementById('bowler-select').value);

    if (!batter_id || !bowler_id) return showToast('Select batter and bowler', 'error');

    try {
        const res = await fetch(`/api/matches/${matchId}/delivery`, {
            method: 'POST',
            headers: scorerHeaders(),
            body: JSON.stringify({ batter_id, bowler_id, runs_scored: 0, is_miss: true })
        });

        if (res.status === 403) return showToast('Only the scorer can record deliveries', 'error');
        const data = await res.json();
        if (!res.ok) return showToast(data.error, 'error');

        handleDeliveryResponse(data);
    } catch (err) {
        showToast('Network error', 'error');
    }
}

async function recordExtra(type) {
    const batter_id = Number(document.getElementById('striker-select').value);
    const bowler_id = Number(document.getElementById('bowler-select').value);

    if (!batter_id || !bowler_id) return showToast('Select batter and bowler', 'error');

    try {
        const body = { batter_id, bowler_id, runs_scored: 0 };
        if (type === 'wide') body.is_wide = true;
        if (type === 'noball') body.is_noball = true;

        const res = await fetch(`/api/matches/${matchId}/delivery`, {
            method: 'POST',
            headers: scorerHeaders(),
            body: JSON.stringify(body)
        });

        if (res.status === 403) return showToast('Only the scorer can record deliveries', 'error');
        const data = await res.json();
        if (!res.ok) return showToast(data.error, 'error');

        handleDeliveryResponse(data);
    } catch (err) {
        showToast('Network error', 'error');
    }
}

function showWicketModal() {
    document.getElementById('wicket-modal').classList.add('active');
    // Show/hide fielder group based on dismissal type
    const dismissalType = document.getElementById('dismissal-type');
    dismissalType.onchange = () => {
        const needsFielder = ['caught_one_hand', 'run_out', 'stumped'].includes(dismissalType.value);
        document.getElementById('fielder-group').style.display = needsFielder ? 'block' : 'none';
    };
    dismissalType.dispatchEvent(new Event('change'));
}

async function confirmWicket() {
    const batter_id = Number(document.getElementById('striker-select').value);
    const bowler_id = Number(document.getElementById('bowler-select').value);
    const dismissal_type = document.getElementById('dismissal-type').value;
    const fielder_id = Number(document.getElementById('fielder-select').value) || null;
    const runs_scored = Number(document.getElementById('wicket-runs').value) || 0;

    if (!batter_id || !bowler_id) return showToast('Select batter and bowler', 'error');

    try {
        const res = await fetch(`/api/matches/${matchId}/delivery`, {
            method: 'POST',
            headers: scorerHeaders(),
            body: JSON.stringify({ batter_id, bowler_id, runs_scored, is_wicket: true, dismissal_type, fielder_id })
        });

        if (res.status === 403) return showToast('Only the scorer can record deliveries', 'error');
        const data = await res.json();
        if (!res.ok) return showToast(data.error, 'error');

        closeModal('wicket-modal');
        handleDeliveryResponse(data);
    } catch (err) {
        showToast('Network error', 'error');
    }
}

function handleDeliveryResponse(data) {
    // Show commentary
    if (data.delivery?.commentary) {
        document.getElementById('last-ball-card').style.display = 'block';
        document.getElementById('last-ball-commentary').textContent = data.delivery.commentary;
    }

    if (data.matchComplete) {
        showToast('🏆 Match Complete!', 'success');
        setTimeout(() => {
            window.location.href = `/match?id=${matchId}`;
        }, 1500);
        return;
    }

    if (data.inningsComplete) {
        showToast('📋 Innings Complete! Starting next innings...', 'info');
    }

    // Auto-rotate strike on odd runs (1)
    // In corridor cricket with single batter, no strike rotation needed
    // Just reload state
    loadMatchState();
}

async function undoDelivery() {
    if (!confirm('Undo the last delivery?')) return;
    
    try {
        const res = await fetch(`/api/matches/${matchId}/undo`, {
            method: 'POST',
            headers: scorerHeaders()
        });
        if (res.status === 403) return showToast('Only the scorer can undo', 'error');
        const data = await res.json();
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
        const res = await fetch(`/api/matches/${matchId}/end-innings`, {
            method: 'PUT',
            headers: scorerHeaders()
        });
        if (res.status === 403) return showToast('Only the scorer can end innings', 'error');
        const data = await res.json();
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
        const res = await fetch(`/api/matches/${matchId}/complete`, {
            method: 'PUT',
            headers: scorerHeaders(),
            body: JSON.stringify({ result: 'Match ended' })
        });
        if (res.status === 403) return showToast('Only the scorer can end the match', 'error');
        const data = await res.json();
        if (!res.ok) return showToast(data.error, 'error');
        showToast('Match ended!', 'success');
        setTimeout(() => location.reload(), 1000);
    } catch (err) {
        showToast('Network error', 'error');
    }
}

async function startMatch() {
    try {
        const res = await fetch(`/api/matches/${matchId}/start`, {
            method: 'PUT',
            headers: scorerHeaders()
        });
        if (res.status === 403) return showToast('Only the scorer can start the match', 'error');
        const data = await res.json();
        if (!res.ok) return showToast(data.error, 'error');
        showToast('Match started! 🏏', 'success');
        location.reload();
    } catch (err) {
        showToast('Network error', 'error');
    }
}
