/**
 * Player Stats Page Logic
 */

let formChart = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadPlayerDropdowns();
    
    // Check URL for pre-selected player
    const pid = getUrlParam('id');
    if (pid) {
        document.getElementById('player-select').value = pid;
        await loadPlayerStats();
    }
});

async function loadPlayerDropdowns() {
    try {
        const players = await apiGet('/api/players');
        const options = players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        
        document.getElementById('player-select').innerHTML = '<option value="">Choose a player...</option>' + options;
        document.getElementById('h2h-player1').innerHTML = '<option value="">Select player</option>' + options;
        document.getElementById('h2h-player2').innerHTML = '<option value="">Select player</option>' + options;
    } catch (err) {
        showToast('Failed to load players', 'error');
    }
}

async function loadPlayerStats() {
    const playerId = document.getElementById('player-select').value;
    if (!playerId) {
        document.getElementById('player-stats-content').classList.add('hidden');
        return;
    }

    try {
        const data = await apiGet(`/api/players/${playerId}/stats`);
        const container = document.getElementById('player-stats-content');
        container.classList.remove('hidden');

        // Header
        document.getElementById('stats-avatar').innerHTML = '';
        document.getElementById('stats-avatar').style.background = data.player.avatar_color;
        document.getElementById('stats-avatar').textContent = data.player.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        document.getElementById('stats-player-name').textContent = data.player.name;
        document.getElementById('stats-matches-played').textContent = `${data.matches} match${data.matches !== 1 ? 'es' : ''} played`;

        // Batting
        document.getElementById('bat-runs').textContent = data.batting.runs;
        document.getElementById('bat-avg').textContent = data.batting.average;
        document.getElementById('bat-sr').textContent = data.batting.strike_rate;
        document.getElementById('bat-hs').textContent = data.batting.highest_score;
        document.getElementById('bat-innings').textContent = data.batting.innings;
        document.getElementById('bat-no').textContent = data.batting.not_outs;
        document.getElementById('bat-boundaries').textContent = data.batting.boundaries;
        document.getElementById('bat-balls').textContent = data.batting.balls_faced;

        // Bowling
        document.getElementById('bowl-wickets').textContent = data.bowling.wickets;
        document.getElementById('bowl-avg').textContent = data.bowling.average;
        document.getElementById('bowl-econ').textContent = data.bowling.economy;
        document.getElementById('bowl-best').textContent = data.bowling.best;

        // Fielding
        document.getElementById('field-catches').textContent = data.fielding.catches;

        // Recent form chart
        await loadRecentForm(playerId);
    } catch (err) {
        showToast('Failed to load stats: ' + err.message, 'error');
    }
}

async function loadRecentForm(playerId) {
    try {
        const recent = await apiGet(`/api/players/${playerId}/recent`);
        const ctx = document.getElementById('form-chart');
        if (!ctx) return;

        if (formChart) formChart.destroy();

        if (recent.length === 0) {
            formChart = null;
            return;
        }

        const labels = recent.reverse().map((r, i) => `Inn ${i + 1}`);
        const runs = recent.map(r => r.runs);

        formChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Runs',
                    data: runs,
                    backgroundColor: runs.map(r => r >= 30 ? 'rgba(201, 123, 75, 0.8)' : r >= 15 ? 'rgba(106, 175, 123, 0.7)' : 'rgba(155, 142, 131, 0.4)'),
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#9B8E83' } },
                    y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#9B8E83', stepSize: 5 } }
                }
            }
        });
    } catch (err) {
        console.error('Form chart error:', err);
    }
}

async function loadHeadToHead() {
    const p1 = document.getElementById('h2h-player1').value;
    const p2 = document.getElementById('h2h-player2').value;
    
    if (!p1 || !p2) {
        showToast('Select both players', 'warning');
        return;
    }
    if (p1 === p2) {
        showToast('Select different players', 'warning');
        return;
    }

    try {
        const data = await apiGet(`/api/stats/head-to-head?p1=${p1}&p2=${p2}`);
        const container = document.getElementById('h2h-result');
        container.classList.remove('hidden');

        container.innerHTML = `
            <div class="grid grid-2">
                <div class="card text-center">
                    ${buildAvatar(data.player1.name, data.player1.avatar_color, 'lg')}
                    <h4 class="mt-sm">${data.player1.name}</h4>
                    <p class="text-sm text-muted">vs ${data.player2.name}'s bowling</p>
                    <div class="grid grid-2 mt-md">
                        <div><div class="stat-value" style="font-size:1.5rem">${data.player1.batting_vs.runs}</div><div class="stat-label">Runs</div></div>
                        <div><div class="stat-value" style="font-size:1.5rem">${data.player1.batting_vs.balls}</div><div class="stat-label">Balls</div></div>
                        <div><div class="stat-value" style="font-size:1.5rem">${data.player1.batting_vs.dismissals}</div><div class="stat-label">Dismissed</div></div>
                        <div><div class="stat-value" style="font-size:1.5rem">${data.player1.batting_vs.boundaries}</div><div class="stat-label">Boundaries</div></div>
                    </div>
                </div>
                <div class="card text-center">
                    ${buildAvatar(data.player2.name, data.player2.avatar_color, 'lg')}
                    <h4 class="mt-sm">${data.player2.name}</h4>
                    <p class="text-sm text-muted">vs ${data.player1.name}'s bowling</p>
                    <div class="grid grid-2 mt-md">
                        <div><div class="stat-value" style="font-size:1.5rem">${data.player2.batting_vs.runs}</div><div class="stat-label">Runs</div></div>
                        <div><div class="stat-value" style="font-size:1.5rem">${data.player2.batting_vs.balls}</div><div class="stat-label">Balls</div></div>
                        <div><div class="stat-value" style="font-size:1.5rem">${data.player2.batting_vs.dismissals}</div><div class="stat-label">Dismissed</div></div>
                        <div><div class="stat-value" style="font-size:1.5rem">${data.player2.batting_vs.boundaries}</div><div class="stat-label">Boundaries</div></div>
                    </div>
                </div>
            </div>
        `;
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}
