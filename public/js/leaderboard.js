/**
 * Leaderboard Page Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadLeaderboard(), loadRecords()]);
});

async function loadLeaderboard() {
    try {
        const data = await apiGet('/api/stats/leaderboard');

        // Orange Cap
        renderLeaderboardList('orange-cap-list', data.orangeCap, p => p.total_runs, p => `Avg: ${p.average} | SR: ${p.strike_rate}`);

        // Purple Cap
        renderLeaderboardList('purple-cap-list', data.purpleCap, p => p.wickets, p => `Avg: ${p.bowling_average || '-'} | Econ: ${p.economy}`);

        // Strike Rate
        renderLeaderboardList('sr-list', data.bestStrikeRates, p => p.strike_rate, p => `${p.total_runs} runs off ${p.balls_faced} balls`);

        // Economy
        renderLeaderboardList('econ-list', data.bestEconomy, p => p.economy, p => `${p.legal_balls} balls bowled`);

        // Catches
        renderLeaderboardList('catches-list', data.mostCatches, p => p.catches, () => 'One-hand catches');

    } catch (err) {
        showToast('Failed to load leaderboard', 'error');
        console.error(err);
    }
}

function renderLeaderboardList(containerId, players, statFn, labelFn) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!players || players.length === 0) {
        container.innerHTML = '<div class="empty-state"><p class="text-muted">No data yet. Play some matches!</p></div>';
        return;
    }

    container.innerHTML = players.map((p, i) => 
        buildLeaderboardItem(p, i + 1, statFn(p), labelFn(p))
    ).join('');
}

async function loadRecords() {
    try {
        const data = await apiGet('/api/stats/records');

        // Highest scores
        const highScoreEl = document.getElementById('records-high-score');
        if (data.highestScore && data.highestScore.length > 0) {
            highScoreEl.innerHTML = data.highestScore.map((r, i) => `
                <div class="leaderboard-item">
                    <div class="leaderboard-rank ${i < 3 ? 'rank-' + (i + 1) : ''}">${i + 1}</div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">${r.name}</div>
                        <div class="leaderboard-sub">${r.team_a_name} vs ${r.team_b_name} • ${formatDate(r.created_at)}</div>
                    </div>
                    <div class="leaderboard-stat">${r.runs}<span class="text-sm text-muted">(${r.balls})</span></div>
                </div>
            `).join('');
        } else {
            highScoreEl.innerHTML = '<p class="text-muted text-center">No records yet</p>';
        }

        // Best bowling
        const bestBowlEl = document.getElementById('records-best-bowling');
        if (data.bestBowling && data.bestBowling.length > 0) {
            bestBowlEl.innerHTML = data.bestBowling.map((r, i) => `
                <div class="leaderboard-item">
                    <div class="leaderboard-rank ${i < 3 ? 'rank-' + (i + 1) : ''}">${i + 1}</div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">${r.name}</div>
                        <div class="leaderboard-sub">${r.team_a_name} vs ${r.team_b_name} • ${formatDate(r.created_at)}</div>
                    </div>
                    <div class="leaderboard-stat">${r.wickets}/${r.runs}</div>
                </div>
            `).join('');
        } else {
            bestBowlEl.innerHTML = '<p class="text-muted text-center">No records yet</p>';
        }

        // Highest team totals
        const highTotalEl = document.getElementById('records-high-total');
        if (data.highestTeamTotals && data.highestTeamTotals.length > 0) {
            highTotalEl.innerHTML = data.highestTeamTotals.map((r, i) => `
                <div class="leaderboard-item">
                    <div class="leaderboard-rank ${i < 3 ? 'rank-' + (i + 1) : ''}">${i + 1}</div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">${r.team_name}</div>
                        <div class="leaderboard-sub">vs ${r.team_name === r.team_a_name ? r.team_b_name : r.team_a_name} • ${formatDate(r.created_at)}</div>
                    </div>
                    <div class="leaderboard-stat">${r.total_runs}/${r.total_wickets}</div>
                </div>
            `).join('');
        } else {
            highTotalEl.innerHTML = '<p class="text-muted text-center">No records yet</p>';
        }

        // Lowest team totals
        const lowTotalEl = document.getElementById('records-low-total');
        if (data.lowestTeamTotals && data.lowestTeamTotals.length > 0) {
            lowTotalEl.innerHTML = data.lowestTeamTotals.map((r, i) => `
                <div class="leaderboard-item">
                    <div class="leaderboard-rank ${i < 3 ? 'rank-' + (i + 1) : ''}">${i + 1}</div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">${r.team_name}</div>
                        <div class="leaderboard-sub">vs ${r.team_name === r.team_a_name ? r.team_b_name : r.team_a_name} • ${formatDate(r.created_at)}</div>
                    </div>
                    <div class="leaderboard-stat">${r.total_runs}/${r.total_wickets}</div>
                </div>
            `).join('');
        } else {
            lowTotalEl.innerHTML = '<p class="text-muted text-center">No records yet</p>';
        }
    } catch (err) {
        console.error('Records error:', err);
    }
}
