/**
 * Dashboard Page Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
    await loadOverview();
    await loadPlayers();
    await loadRecentMatches();
    checkLiveMatch();
});

async function loadOverview() {
    try {
        const data = await apiGet('/api/stats/overview');
        document.getElementById('stat-matches').textContent = data.totalMatches;
        document.getElementById('stat-players').textContent = data.totalPlayers;
        document.getElementById('stat-runs').textContent = data.totalRuns;
        document.getElementById('stat-wickets').textContent = data.totalWickets;

        if (data.topScorer && data.topScorer.runs > 0) {
            document.getElementById('top-scorer').innerHTML = `
                <div style="font-family: var(--font-display); font-weight: 800; font-size: 2rem; color: var(--accent-primary);">${data.topScorer.runs}</div>
                <div style="font-weight: 600; margin-top: 4px;">${data.topScorer.name}</div>
            `;
        }

        if (data.topWicketTaker && data.topWicketTaker.wickets > 0) {
            document.getElementById('top-bowler').innerHTML = `
                <div style="font-family: var(--font-display); font-weight: 800; font-size: 2rem; color: #8B6DB8;">${data.topWicketTaker.wickets}</div>
                <div style="font-weight: 600; margin-top: 4px;">${data.topWicketTaker.name}</div>
            `;
        }
    } catch (err) {
        console.error('Failed to load overview:', err);
    }
}

async function loadPlayers() {
    try {
        const players = await apiGet('/api/players');
        const container = document.getElementById('players-list');
        if (players.length === 0) {
            container.innerHTML = '<p class="text-muted">No players yet. Add your first player!</p>';
            return;
        }
        container.innerHTML = players.map(p => `
            <div class="player-chip">
                ${buildAvatar(p.name, p.avatar_color)}
                <span>${p.name}</span>
            </div>
        `).join('');
    } catch (err) {
        console.error('Failed to load players:', err);
    }
}

async function loadRecentMatches() {
    try {
        const matches = await apiGet('/api/matches');
        const container = document.getElementById('recent-matches');
        if (matches.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: span 2;">
                    <div class="icon">🏏</div>
                    <h3>No matches yet</h3>
                    <p>Start your first match to see it here!</p>
                </div>
            `;
            return;
        }
        container.innerHTML = matches.slice(0, 4).map(m => buildMatchCard(m)).join('');
    } catch (err) {
        console.error('Failed to load matches:', err);
    }
}

async function checkLiveMatch() {
    try {
        const matches = await apiGet('/api/matches?status=live');
        if (matches.length > 0) {
            const m = matches[0];
            const banner = document.getElementById('live-banner');
            banner.classList.remove('hidden');
            document.getElementById('live-venue').textContent = m.venue || 'The Corridor';
            document.getElementById('live-score-display').innerHTML = buildScoreDisplay(m, m.innings || []);
            document.getElementById('live-watch-btn').href = `/match?id=${m.id}`;
            document.getElementById('live-score-btn').href = `/scoring?id=${m.id}`;

            // Socket.io for live updates
            const s = getSocket();
            if (s) {
                s.emit('join-match', m.id);
                s.on('score-update', () => {
                    checkLiveMatch(); // Refresh
                });
            }
        }
    } catch (err) {
        console.error('Live match check failed:', err);
    }
}

function showAddPlayerModal() {
    document.getElementById('player-name-input').value = '';
    openModal('add-player-modal');
    setTimeout(() => document.getElementById('player-name-input').focus(), 100);
}

async function addPlayer() {
    const name = document.getElementById('player-name-input').value.trim();
    if (!name) {
        showToast('Please enter a player name', 'warning');
        return;
    }
    try {
        await apiPost('/api/players', { name });
        closeModal('add-player-modal');
        showToast(`${name} added to the squad! 🏏`, 'success');
        await loadPlayers();
        await loadOverview();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// Enter key on player name input
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('player-name-input');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addPlayer();
        });
    }
});
