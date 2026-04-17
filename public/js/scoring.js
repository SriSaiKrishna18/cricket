/**
 * Scoring Panel Logic — The heart of the app
 */

let matchId = null;
let matchState = null;
let currentStriker = null;
let currentNonStriker = null;
let currentBowler = null;

document.addEventListener('DOMContentLoaded', async () => {
    matchId = getUrlParam('id');
    if (!matchId) {
        showToast('No match ID provided', 'error');
        return;
    }
    await loadMatchState();
});

async function loadMatchState() {
    try {
        const match = await apiGet(`/api/matches/${matchId}`);
        
        if (match.status === 'upcoming') {
            document.getElementById('scoring-loading').classList.add('hidden');
            document.getElementById('match-not-started').classList.remove('hidden');
            return;
        }
        
        if (match.status === 'completed') {
            document.getElementById('scoring-loading').classList.add('hidden');
            document.getElementById('match-completed').classList.remove('hidden');
            document.getElementById('completed-result').textContent = match.result || 'Match completed';
            document.getElementById('view-scorecard-link').href = `/match?id=${matchId}`;
            return;
        }

        matchState = await apiGet(`/api/matches/${matchId}/state`);
        
        document.getElementById('scoring-loading').classList.add('hidden');
        document.getElementById('scoring-content').classList.remove('hidden');
        document.getElementById('watch-link').href = `/match?id=${matchId}`;

        renderScoreBar();
        populateSelectors();
        renderOverTimeline();
        updateOverCount();

        // Socket
        const s = getSocket();
        if (s) s.emit('join-match', matchId);
    } catch (err) {
        showToast('Failed to load match: ' + err.message, 'error');
        console.error(err);
    }
}

function renderScoreBar() {
    if (!matchState) return;
    const display = document.getElementById('scoring-score-display');
    display.innerHTML = buildScoreDisplay(matchState.match, matchState.innings);

    // Target info
    if (matchState.target) {
        const targetEl = document.getElementById('scoring-target');
        targetEl.classList.remove('hidden');
        const needed = matchState.target - matchState.currentInnings.total_runs;
        const ballsLeft = (matchState.match.total_overs * 6) - matchState.currentInnings.total_balls;
        if (needed > 0) {
            targetEl.textContent = `Need ${needed} run${needed !== 1 ? 's' : ''} from ${ballsLeft} ball${ballsLeft !== 1 ? 's' : ''} | RRR: ${matchState.requiredRunRate}`;
        } else {
            targetEl.textContent = 'Target chased!';
        }
    }
}

function populateSelectors() {
    if (!matchState) return;
    const { battingPlayers, bowlingPlayers, dismissed, lastDelivery, batterMisses } = matchState;
    
    const availableBatters = battingPlayers.filter(p => !dismissed.includes(p.id));
    
    // Striker select
    const strikerSel = document.getElementById('striker-select');
    strikerSel.innerHTML = availableBatters.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    
    // Non-striker select
    const nonStrikerSel = document.getElementById('non-striker-select');
    nonStrikerSel.innerHTML = `<option value="">— None —</option>` + 
        availableBatters.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    // Bowler select
    const bowlerSel = document.getElementById('bowler-select');
    bowlerSel.innerHTML = bowlingPlayers.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    // Fielder select in wicket modal
    const fielderSel = document.getElementById('fielder-select');
    fielderSel.innerHTML = `<option value="">Select fielder (optional)</option>` +
        bowlingPlayers.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    // Auto-select based on last delivery
    if (lastDelivery) {
        // If last ball was a wicket, we need a new batter
        if (lastDelivery.is_wicket) {
            // The non-dismissed batter continues
            const remaining = availableBatters.filter(p => p.id !== lastDelivery.batter_id);
            if (remaining.length > 0) {
                // Check if non_striker is still available
                if (lastDelivery.non_striker_id && availableBatters.find(p => p.id === lastDelivery.non_striker_id)) {
                    strikerSel.value = lastDelivery.non_striker_id;
                    const nextBatter = remaining.find(p => p.id !== lastDelivery.non_striker_id);
                    if (nextBatter) nonStrikerSel.value = nextBatter.id;
                } else if (remaining.length > 0) {
                    strikerSel.value = remaining[0].id;
                    if (remaining.length > 1) nonStrikerSel.value = remaining[1].id;
                }
            }
        } else {
            // Check if odd runs (strike rotated)
            const runsOnBall = lastDelivery.runs_scored;
            if (runsOnBall % 2 === 1) {
                // Strike rotated
                if (availableBatters.find(p => p.id === lastDelivery.non_striker_id)) {
                    strikerSel.value = lastDelivery.non_striker_id;
                }
                if (availableBatters.find(p => p.id === lastDelivery.batter_id)) {
                    nonStrikerSel.value = lastDelivery.batter_id;
                }
            } else {
                if (availableBatters.find(p => p.id === lastDelivery.batter_id)) {
                    strikerSel.value = lastDelivery.batter_id;
                }
                if (availableBatters.find(p => p.id === lastDelivery.non_striker_id)) {
                    nonStrikerSel.value = lastDelivery.non_striker_id;
                }
            }

            // Check for end of over (ball 6) — strike changes
            const legalBalls = matchState.currentInnings.total_balls;
            if (legalBalls > 0 && legalBalls % 6 === 0 && !lastDelivery.is_wide && !lastDelivery.is_noball) {
                // End of over - swap striker/non-striker
                const tempVal = strikerSel.value;
                strikerSel.value = nonStrikerSel.value;
                nonStrikerSel.value = tempVal;
            }
        }

        // Set bowler
        if (bowlingPlayers.find(p => p.id === lastDelivery.bowler_id)) {
            bowlerSel.value = lastDelivery.bowler_id;
        }
    } else {
        // First ball — set defaults
        if (availableBatters.length > 0) strikerSel.value = availableBatters[0].id;
        if (availableBatters.length > 1) nonStrikerSel.value = availableBatters[1].id;
        if (bowlingPlayers.length > 0) bowlerSel.value = bowlingPlayers[0].id;
    }

    // Update miss dots for striker
    updateMissDots();
    
    // Update on selector change
    strikerSel.onchange = updateMissDots;
}

function updateMissDots() {
    const strikerId = parseInt(document.getElementById('striker-select').value);
    const missDotsEl = document.getElementById('striker-misses');
    if (!matchState || !missDotsEl) return;
    
    const missEntry = matchState.batterMisses.find(m => m.batter_id === strikerId);
    const missCount = missEntry ? missEntry.miss_count : 0;
    
    missDotsEl.innerHTML = [0, 1, 2].map(i => 
        `<div class="miss-dot ${i < missCount ? 'active' : ''}"></div>`
    ).join('');

    // Stats
    const statsEl = document.getElementById('striker-stats');
    if (statsEl && matchState.currentInnings) {
        // We'll show basic info
        statsEl.textContent = missCount > 0 ? `${missCount}/3 misses` : '';
    }
}

function renderOverTimeline() {
    if (!matchState) return;
    const timeline = document.getElementById('scoring-over-timeline');
    const balls = matchState.currentOverBalls || [];
    timeline.innerHTML = balls.length === 0 ? '<span class="text-sm text-muted">New over</span>' :
        balls.map(b => buildBallDot(b)).join('');
}

function updateOverCount() {
    if (!matchState) return;
    const el = document.getElementById('over-count');
    const inn = matchState.currentInnings;
    el.textContent = `Over: ${formatOvers(inn.total_balls)} / ${matchState.match.total_overs} • Innings ${inn.innings_number}`;
}

// ── Record Delivery ──
async function recordDelivery(runs) {
    const batterId = parseInt(document.getElementById('striker-select').value);
    const bowlerId = parseInt(document.getElementById('bowler-select').value);
    const nonStrikerId = parseInt(document.getElementById('non-striker-select').value) || null;

    if (!batterId || !bowlerId) {
        showToast('Select both batter and bowler', 'warning');
        return;
    }

    try {
        const result = await apiPost(`/api/matches/${matchId}/delivery`, {
            batter_id: batterId,
            bowler_id: bowlerId,
            non_striker_id: nonStrikerId,
            runs_scored: runs,
            is_wide: false,
            is_noball: false,
            is_wicket: false,
            is_miss: false
        });

        handleDeliveryResult(result);
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

async function recordMiss() {
    const batterId = parseInt(document.getElementById('striker-select').value);
    const bowlerId = parseInt(document.getElementById('bowler-select').value);
    const nonStrikerId = parseInt(document.getElementById('non-striker-select').value) || null;

    if (!batterId || !bowlerId) {
        showToast('Select both batter and bowler', 'warning');
        return;
    }

    try {
        const result = await apiPost(`/api/matches/${matchId}/delivery`, {
            batter_id: batterId,
            bowler_id: bowlerId,
            non_striker_id: nonStrikerId,
            runs_scored: 0,
            is_miss: true,
            is_wicket: false
        });

        handleDeliveryResult(result);
        
        if (result.delivery.is_wicket) {
            showToast('THREE MISSES — OUT! 🔴', 'error');
        } else {
            showToast(`Miss! (${result.delivery.miss_count}/3)`, 'warning');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

async function recordExtra(type) {
    const batterId = parseInt(document.getElementById('striker-select').value);
    const bowlerId = parseInt(document.getElementById('bowler-select').value);
    const nonStrikerId = parseInt(document.getElementById('non-striker-select').value) || null;

    if (!batterId || !bowlerId) {
        showToast('Select both batter and bowler', 'warning');
        return;
    }

    try {
        const result = await apiPost(`/api/matches/${matchId}/delivery`, {
            batter_id: batterId,
            bowler_id: bowlerId,
            non_striker_id: nonStrikerId,
            runs_scored: 0,
            is_wide: type === 'wide',
            is_noball: type === 'noball'
        });

        handleDeliveryResult(result);
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

function showWicketModal() {
    openModal('wicket-modal');
}

async function confirmWicket() {
    const batterId = parseInt(document.getElementById('striker-select').value);
    const bowlerId = parseInt(document.getElementById('bowler-select').value);
    const nonStrikerId = parseInt(document.getElementById('non-striker-select').value) || null;
    const dismissalType = document.getElementById('dismissal-type').value;
    const fielderId = parseInt(document.getElementById('fielder-select').value) || null;
    const runs = parseInt(document.getElementById('wicket-runs').value) || 0;

    if (!batterId || !bowlerId) {
        showToast('Select both batter and bowler', 'warning');
        return;
    }

    try {
        const result = await apiPost(`/api/matches/${matchId}/delivery`, {
            batter_id: batterId,
            bowler_id: bowlerId,
            non_striker_id: nonStrikerId,
            runs_scored: runs,
            is_wicket: true,
            dismissal_type: dismissalType,
            fielder_id: fielderId
        });

        closeModal('wicket-modal');
        handleDeliveryResult(result);
        showToast('WICKET! 🔴', 'error');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

function handleDeliveryResult(result) {
    // Show commentary
    if (result.delivery && result.delivery.commentary) {
        const card = document.getElementById('last-ball-card');
        card.style.display = 'block';
        document.getElementById('last-ball-commentary').textContent = result.delivery.commentary;
    }

    if (result.matchComplete) {
        showToast('Match completed! 🏆', 'success');
        setTimeout(() => {
            window.location.href = `/match?id=${matchId}`;
        }, 1500);
        return;
    }

    if (result.inningsComplete) {
        showToast('Innings over! Starting second innings...', 'info');
    }

    // Reload state
    loadMatchState();
}

function swapBatters() {
    const strikerSel = document.getElementById('striker-select');
    const nonStrikerSel = document.getElementById('non-striker-select');
    const temp = strikerSel.value;
    strikerSel.value = nonStrikerSel.value;
    nonStrikerSel.value = temp;
    updateMissDots();
    showToast('Batters swapped', 'info');
}

async function undoDelivery() {
    if (!confirm('Undo the last delivery?')) return;
    try {
        await apiPost(`/api/matches/${matchId}/undo`);
        showToast('Last ball undone ↩️', 'info');
        await loadMatchState();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

async function confirmEndInnings() {
    if (!confirm('End the current innings?')) return;
    try {
        const result = await apiPut(`/api/matches/${matchId}/end-innings`);
        showToast(result.message, 'success');
        await loadMatchState();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

async function confirmEndMatch() {
    if (!confirm('End the match? This cannot be undone.')) return;
    try {
        await apiPut(`/api/matches/${matchId}/complete`, { result: 'Match ended manually' });
        showToast('Match ended', 'info');
        window.location.href = `/match?id=${matchId}`;
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

async function startMatch() {
    try {
        await apiPut(`/api/matches/${matchId}/start`);
        showToast('Match started! 🏏', 'success');
        document.getElementById('match-not-started').classList.add('hidden');
        await loadMatchState();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}
