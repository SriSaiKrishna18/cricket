/**
 * New Match Setup Logic
 */

let allPlayers = [];
let teamA = [];
let teamB = [];
let currentTeam = 'A'; // Which team to add next player to

document.addEventListener('DOMContentLoaded', async () => {
    await loadAvailablePlayers();
    updateTeamLabels();
});

async function loadAvailablePlayers() {
    try {
        allPlayers = await apiGet('/api/players');
        renderAvailablePlayers();
    } catch (err) {
        showToast('Failed to load players', 'error');
    }
}

function renderAvailablePlayers() {
    const container = document.getElementById('available-players');
    const assignedIds = [...teamA.map(p => p.id), ...teamB.map(p => p.id)];
    const available = allPlayers.filter(p => !assignedIds.includes(p.id));
    
    if (available.length === 0 && allPlayers.length === 0) {
        container.innerHTML = '<p class="text-muted">No players yet. Add some players first!</p>';
        return;
    }
    
    if (available.length === 0) {
        container.innerHTML = '<p class="text-muted">All players assigned to teams</p>';
        return;
    }

    container.innerHTML = available.map(p => `
        <div class="player-chip" onclick="assignPlayer(${p.id})" data-id="${p.id}">
            ${buildAvatar(p.name, p.avatar_color)}
            <span>${p.name}</span>
            <span class="text-sm text-muted">(→ Team ${currentTeam})</span>
        </div>
    `).join('');
}

function assignPlayer(playerId) {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return;

    if (currentTeam === 'A') {
        teamA.push(player);
        currentTeam = 'B';
    } else {
        teamB.push(player);
        currentTeam = 'A';
    }

    renderTeamSelections();
    renderAvailablePlayers();
    updateTeamLabels();
}

function removeFromTeam(playerId, team) {
    if (team === 'A') {
        teamA = teamA.filter(p => p.id !== playerId);
    } else {
        teamB = teamB.filter(p => p.id !== playerId);
    }
    renderTeamSelections();
    renderAvailablePlayers();
}

function renderTeamSelections() {
    const teamAContainer = document.getElementById('team-a-selected');
    const teamBContainer = document.getElementById('team-b-selected');

    teamAContainer.innerHTML = teamA.length === 0 ? '<span class="text-sm text-muted">Click players below</span>' :
        teamA.map(p => `
            <div class="player-chip selected" style="border-color: var(--accent-primary);">
                ${buildAvatar(p.name, p.avatar_color)}
                <span>${p.name}</span>
                <span class="remove" onclick="event.stopPropagation(); removeFromTeam(${p.id}, 'A')">✕</span>
            </div>
        `).join('');

    teamBContainer.innerHTML = teamB.length === 0 ? '<span class="text-sm text-muted">Click players below</span>' :
        teamB.map(p => `
            <div class="player-chip selected" style="border-color: var(--accent-secondary);">
                ${buildAvatar(p.name, p.avatar_color)}
                <span>${p.name}</span>
                <span class="remove" onclick="event.stopPropagation(); removeFromTeam(${p.id}, 'B')">✕</span>
            </div>
        `).join('');

    // Update toss winner dropdown
    const tossSelect = document.getElementById('toss-winner');
    const teamAName = document.getElementById('team-a-name').value || 'Team A';
    const teamBName = document.getElementById('team-b-name').value || 'Team B';
    tossSelect.innerHTML = `
        <option value="">Select winner</option>
        <option value="${teamAName}">${teamAName}</option>
        <option value="${teamBName}">${teamBName}</option>
    `;
}

function updateTeamLabels() {
    const teamAName = document.getElementById('team-a-name').value || 'Team A';
    const teamBName = document.getElementById('team-b-name').value || 'Team B';
    document.getElementById('team-a-label').textContent = teamAName + ` (${teamA.length})`;
    document.getElementById('team-b-label').textContent = teamBName + ` (${teamB.length})`;
}

// Update labels on name change
document.addEventListener('DOMContentLoaded', () => {
    ['team-a-name', 'team-b-name'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => {
            updateTeamLabels();
            renderTeamSelections();
        });
    });
});

// Quick add player
function showQuickAddPlayer() {
    document.getElementById('quick-add-area').classList.remove('hidden');
    document.getElementById('quick-player-name').focus();
}

function hideQuickAddPlayer() {
    document.getElementById('quick-add-area').classList.add('hidden');
}

async function quickAddPlayer() {
    const name = document.getElementById('quick-player-name').value.trim();
    if (!name) return;
    try {
        const player = await apiPost('/api/players', { name });
        allPlayers.push(player);
        document.getElementById('quick-player-name').value = '';
        renderAvailablePlayers();
        showToast(`${name} added!`, 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const qpn = document.getElementById('quick-player-name');
    if (qpn) qpn.addEventListener('keypress', e => { if (e.key === 'Enter') quickAddPlayer(); });
});

// Coin flip
function flipCoin() {
    const coin = document.getElementById('coin');
    coin.classList.add('flipping');
    document.getElementById('toss-instruction').textContent = 'Flipping...';
    
    setTimeout(() => {
        coin.classList.remove('flipping');
        const result = Math.random() > 0.5 ? 'Heads' : 'Tails';
        coin.textContent = result === 'Heads' ? '🪙' : '🎲';
        document.getElementById('toss-instruction').textContent = `Result: ${result}!`;
        document.getElementById('toss-result').classList.remove('hidden');
    }, 1500);
}

// Create match
async function createMatch() {
    const teamAName = document.getElementById('team-a-name').value.trim() || 'Team A';
    const teamBName = document.getElementById('team-b-name').value.trim() || 'Team B';
    const totalOvers = parseInt(document.getElementById('total-overs').value);
    const venue = document.getElementById('venue').value.trim() || 'The Corridor';
    const tossWinner = document.getElementById('toss-winner').value;
    const tossDecision = document.getElementById('toss-decision').value;

    if (teamA.length === 0 || teamB.length === 0) {
        showToast('Both teams need at least 1 player!', 'warning');
        return;
    }

    const btn = document.getElementById('create-match-btn');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
        const match = await apiPost('/api/matches', {
            team_a_name: teamAName,
            team_b_name: teamBName,
            total_overs: totalOvers,
            toss_winner: tossWinner || null,
            toss_decision: tossDecision || null,
            team_a_players: teamA.map(p => p.id),
            team_b_players: teamB.map(p => p.id),
            venue
        });

        // Store scorer token — only this browser can score
        if (match.scorer_token) {
            localStorage.setItem(`scorer-token-${match.id}`, match.scorer_token);
        }

        // Start the match using the scorer token
        await fetch(`/api/matches/${match.id}/start`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Scorer-Token': match.scorer_token || ''
            }
        });
        
        showToast('Match created & started! 🏏', 'success');
        window.location.href = `/scoring?id=${match.id}`;
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = '🏏 Create Match & Start Scoring';
    }
}
