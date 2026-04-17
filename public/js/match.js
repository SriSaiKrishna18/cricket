/**
 * Live Match View Logic
 */

let matchId = null;
let manhattanChart = null;
let runRateChart = null;

document.addEventListener('DOMContentLoaded', async () => {
    matchId = getUrlParam('id');
    if (!matchId) {
        showToast('No match ID', 'error');
        return;
    }
    await loadMatch();
    setupSocket();
});

async function loadMatch() {
    try {
        const match = await apiGet(`/api/matches/${matchId}`);
        
        document.getElementById('match-loading').classList.add('hidden');
        document.getElementById('match-content').classList.remove('hidden');

        // Badge
        const badge = document.getElementById('match-badge');
        if (match.status === 'live') {
            badge.className = 'live-badge';
            badge.innerHTML = '<span></span>LIVE';
        } else if (match.status === 'completed') {
            badge.className = 'match-status-badge badge-completed';
            badge.textContent = '✅ Completed';
        } else {
            badge.className = 'match-status-badge badge-upcoming';
            badge.textContent = '📅 Upcoming';
        }

        document.getElementById('match-venue').textContent = match.venue || 'The Corridor';

        // Score display
        const innings = match.innings || [];
        document.getElementById('match-score-display').innerHTML = buildScoreDisplay(match, innings);

        // Target info
        if (innings.length === 2) {
            const currentInn = innings.find(i => !i.is_completed) || innings[1];
            if (currentInn.innings_number === 2) {
                const target = innings[0].total_runs + 1;
                const needed = target - currentInn.total_runs;
                const ballsLeft = (match.total_overs * 6) - currentInn.total_balls;
                const targetEl = document.getElementById('match-target-info');
                targetEl.classList.remove('hidden');
                if (needed > 0 && match.status === 'live') {
                    targetEl.textContent = `Target: ${target} | Need ${needed} from ${ballsLeft} balls`;
                } else if (match.status === 'completed') {
                    targetEl.textContent = `Target was ${target}`;
                }
            }
        }

        // Result
        if (match.result) {
            const resultEl = document.getElementById('match-result-display');
            resultEl.classList.remove('hidden');
            resultEl.textContent = match.result;
        }

        // Load details
        await Promise.all([
            loadLiveTab(),
            loadScorecard(),
            loadCommentary(),
            loadGraphs()
        ]);
    } catch (err) {
        showToast('Failed to load match: ' + err.message, 'error');
        console.error(err);
    }
}

async function loadLiveTab() {
    try {
        const state = await apiGet(`/api/matches/${matchId}/state`);
        if (!state.currentInnings) return;

        // Current run rates
        document.getElementById('crr-display').textContent = state.currentRunRate || '0.00';
        document.getElementById('rrr-display').textContent = state.requiredRunRate || '—';

        // This over timeline
        const timeline = document.getElementById('this-over-timeline');
        const balls = state.currentOverBalls || [];
        timeline.innerHTML = balls.length === 0 ? '<span class="text-sm text-muted">New over</span>' :
            balls.map(b => buildBallDot(b)).join('');

        // Current batters
        renderCurrentBatters(state);
        
        // Current bowler
        renderCurrentBowler(state);
    } catch (err) {
        console.error('Live tab error:', err);
    }
}

function renderCurrentBatters(state) {
    const container = document.getElementById('current-batters');
    if (!state.lastDelivery) {
        container.innerHTML = '<p class="text-muted">Waiting for first delivery...</p>';
        return;
    }

    const strikerId = state.lastDelivery.batter_id;
    const nonStrikerId = state.lastDelivery.non_striker_id;

    // Build stats from scorecard
    const batters = [];
    if (strikerId) {
        const p = state.battingPlayers.find(pl => pl.id === strikerId);
        if (p) batters.push({ ...p, isStriker: true });
    }
    if (nonStrikerId) {
        const p = state.battingPlayers.find(pl => pl.id === nonStrikerId);
        if (p) batters.push({ ...p, isStriker: false });
    }

    container.innerHTML = batters.map(b => {
        const missEntry = state.batterMisses.find(m => m.batter_id === b.id);
        const misses = missEntry ? missEntry.miss_count : 0;
        return `
            <div class="player-card-inline mb-sm">
                ${buildAvatar(b.name, b.avatar_color)}
                <div>
                    <div class="player-name ${b.isStriker ? 'on-strike' : ''}">${b.name}</div>
                    <div class="player-stats">At crease ${misses > 0 ? `• ${misses}/3 misses` : ''}</div>
                    ${misses > 0 ? `<div class="miss-dots">${[0,1,2].map(i => `<div class="miss-dot ${i < misses ? 'active' : ''}"></div>`).join('')}</div>` : ''}
                </div>
            </div>
        `;
    }).join('') || '<p class="text-muted">No batter at crease</p>';
}

function renderCurrentBowler(state) {
    const container = document.getElementById('current-bowler');
    if (!state.lastDelivery) {
        container.innerHTML = '<p class="text-muted">Waiting for first delivery...</p>';
        return;
    }

    const bowlerId = state.lastDelivery.bowler_id;
    const p = state.bowlingPlayers.find(pl => pl.id === bowlerId);
    if (!p) {
        container.innerHTML = '<p class="text-muted">Unknown bowler</p>';
        return;
    }

    container.innerHTML = `
        <div class="player-card-inline">
            ${buildAvatar(p.name, p.avatar_color)}
            <div>
                <div class="player-name">${p.name}</div>
                <div class="player-stats">Bowling</div>
            </div>
        </div>
    `;
}

async function loadScorecard() {
    try {
        const data = await apiGet(`/api/matches/${matchId}/scorecard`);
        const container = document.getElementById('scorecard-content');
        
        if (!data.scorecard || data.scorecard.length === 0) {
            container.innerHTML = '<div class="empty-state"><p class="text-muted">No scorecard data yet</p></div>';
            return;
        }

        container.innerHTML = data.scorecard.map(sc => {
            const teamName = sc.innings.batting_team === 'A' ? data.match.team_a_name : data.match.team_b_name;
            return `
                <div class="card mb-lg">
                    <h3 class="mb-md">${teamName} — ${sc.innings.total_runs}/${sc.innings.total_wickets} (${formatOvers(sc.innings.total_balls)} ov)</h3>
                    
                    <h4 class="mb-sm">Batting</h4>
                    <div class="table-container mb-lg">
                        <table>
                            <thead>
                                <tr><th>Batter</th><th>Dismissal</th><th>R</th><th>B</th><th>2s</th><th>SR</th></tr>
                            </thead>
                            <tbody>
                                ${sc.batters.map(b => `
                                    <tr>
                                        <td>${b.name}</td>
                                        <td class="dismissal-text">${b.is_out ? getDismissalText(b.dismissal) : 'not out'}</td>
                                        <td><strong>${b.runs}</strong></td>
                                        <td>${b.balls}</td>
                                        <td>${b.boundaries}</td>
                                        <td>${b.strike_rate}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <p class="text-sm text-muted mb-lg">Extras: ${sc.innings.extras} &nbsp;|&nbsp; Total: ${sc.innings.total_runs}/${sc.innings.total_wickets}</p>

                    <h4 class="mb-sm">Bowling</h4>
                    <div class="table-container mb-lg">
                        <table>
                            <thead>
                                <tr><th>Bowler</th><th>O</th><th>R</th><th>W</th><th>Econ</th><th>Wd</th><th>Nb</th></tr>
                            </thead>
                            <tbody>
                                ${sc.bowlers.map(b => `
                                    <tr>
                                        <td>${b.name}</td>
                                        <td>${b.overs}</td>
                                        <td>${b.runs_conceded}</td>
                                        <td><strong>${b.wickets}</strong></td>
                                        <td>${b.economy}</td>
                                        <td>${b.wides}</td>
                                        <td>${b.noballs}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    ${sc.fallOfWickets.length > 0 ? `
                        <h4 class="mb-sm">Fall of Wickets</h4>
                        <p class="text-sm text-muted">
                            ${sc.fallOfWickets.map((f, i) => `${f.team_score}/${i + 1} (${f.batter_name})`).join(' • ')}
                        </p>
                    ` : ''}
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Scorecard error:', err);
    }
}

async function loadCommentary() {
    try {
        const data = await apiGet(`/api/matches/${matchId}/commentary`);
        const feed = document.getElementById('commentary-feed');
        
        const allDeliveries = [];
        data.forEach(inn => {
            inn.deliveries.forEach(d => {
                allDeliveries.push({ ...d, innings_number: inn.innings_number });
            });
        });

        if (allDeliveries.length === 0) {
            feed.innerHTML = '<div class="empty-state"><p class="text-muted">No deliveries yet</p></div>';
            return;
        }

        feed.innerHTML = allDeliveries.map(d => {
            let textClass = '';
            if (d.is_wicket) textClass = 'wicket';
            else if (d.is_boundary) textClass = 'boundary';

            return `
                <div class="commentary-item">
                    <div class="commentary-over">${d.over_number}.${d.ball_number}</div>
                    <div class="commentary-text ${textClass}">${d.commentary || `${d.bowler_name} to ${d.batter_name}, ${d.runs_scored} run(s)`}</div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Commentary error:', err);
    }
}

async function loadGraphs() {
    try {
        const data = await apiGet(`/api/matches/${matchId}/graph-data`);
        if (!data || data.length === 0) return;

        renderManhattan(data);
        renderRunRate(data);
        renderPartnerships(data);
    } catch (err) {
        console.error('Graph error:', err);
    }
}

function renderManhattan(data) {
    const ctx = document.getElementById('manhattan-chart');
    if (!ctx) return;

    if (manhattanChart) manhattanChart.destroy();

    const datasets = data.map((inn, i) => ({
        label: inn.batting_team,
        data: inn.runsPerOver.map(r => ({ x: r.over_number + 1, y: r.runs })),
        backgroundColor: i === 0 ? 'rgba(201, 123, 75, 0.7)' : 'rgba(91, 141, 184, 0.7)',
        borderColor: i === 0 ? '#C97B4B' : '#5B8DB8',
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.6,
        categoryPercentage: 0.8
    }));

    const maxOver = Math.max(...data.flatMap(d => d.runsPerOver.map(r => r.over_number + 1)), 1);

    manhattanChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Array.from({ length: maxOver }, (_, i) => i + 1),
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#6B5D52', font: { family: 'Inter' } } }
            },
            scales: {
                x: { title: { display: true, text: 'Over', color: '#9B8E83' }, grid: { display: false }, ticks: { color: '#9B8E83' } },
                y: { title: { display: true, text: 'Runs', color: '#9B8E83' }, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#9B8E83', stepSize: 1 } }
            }
        }
    });
}

function renderRunRate(data) {
    const ctx = document.getElementById('runrate-chart');
    if (!ctx) return;

    if (runRateChart) runRateChart.destroy();

    const datasets = data.map((inn, i) => ({
        label: inn.batting_team,
        data: inn.runRateProgression.map(r => ({ x: r.ball, y: parseFloat(r.runRate) })),
        borderColor: i === 0 ? '#C97B4B' : '#5B8DB8',
        backgroundColor: i === 0 ? 'rgba(201, 123, 75, 0.1)' : 'rgba(91, 141, 184, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 5,
        borderWidth: 2
    }));

    runRateChart = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#6B5D52', font: { family: 'Inter' } } }
            },
            scales: {
                x: { type: 'linear', title: { display: true, text: 'Balls', color: '#9B8E83' }, grid: { display: false }, ticks: { color: '#9B8E83' } },
                y: { title: { display: true, text: 'Run Rate', color: '#9B8E83' }, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#9B8E83' } }
            }
        }
    });
}

function renderPartnerships(data) {
    const container = document.getElementById('partnerships-display');
    if (!container) return;

    let html = '';
    data.forEach(inn => {
        if (inn.partnerships.length === 0) return;
        const maxRuns = Math.max(...inn.partnerships.map(p => p.runs), 1);
        
        html += `<h4 class="mb-sm">${inn.batting_team}</h4>`;
        html += inn.partnerships.map(p => {
            const width = Math.max((p.runs / maxRuns) * 100, 8);
            return `
                <div class="partnership-bar">
                    <div class="partnership-label">${p.batter1} & ${p.batter2}</div>
                    <div class="partnership-fill" style="width: ${width}%">${p.runs}</div>
                    <span class="text-sm text-muted">(${p.balls}b)${p.current ? ' *' : ''}</span>
                </div>
            `;
        }).join('');
    });

    container.innerHTML = html || '<p class="text-muted">No partnership data</p>';
}

function setupSocket() {
    const s = getSocket();
    if (!s) return;
    
    s.emit('join-match', matchId);
    
    s.on('score-update', () => {
        loadMatch();
    });

    s.on('undo', () => {
        loadMatch();
    });

    s.on('innings-change', () => {
        showToast('Innings change!', 'info');
        loadMatch();
    });

    s.on('match-complete', (data) => {
        showToast('Match completed! 🏆', 'success');
        loadMatch();
    });
}
