/**
 * Corridor Cricket — Shared App Utilities
 */

const API = '';

// ── API Helpers ──
async function api(path, options = {}) {
    const url = `${API}${path}`;
    const config = {
        headers: { 'Content-Type': 'application/json' },
        ...options
    };
    if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }
    const res = await fetch(url, config);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API Error');
    return data;
}

function apiGet(path) { return api(path); }
function apiPost(path, body) { return api(path, { method: 'POST', body }); }
function apiPut(path, body) { return api(path, { method: 'PUT', body }); }
function apiDelete(path) { return api(path, { method: 'DELETE' }); }

// ── Toast Notifications ──
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || ''}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ── Modal Helpers ──
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// ── Tab System ──
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabGroup = btn.closest('.tabs') || btn.parentElement;
            const tabId = btn.dataset.tab;
            
            // Deactivate all tabs in this group
            tabGroup.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Get tab content — search siblings of the tab group's parent
            const parent = tabGroup.parentElement;
            parent.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            const target = document.getElementById(tabId);
            if (target) target.classList.add('active');
        });
    });
});

// ── Format Helpers ──
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatOvers(balls) {
    const overs = Math.floor(balls / 6);
    const remainder = balls % 6;
    return `${overs}.${remainder}`;
}

// ── Score Display Builder ──
function buildScoreDisplay(match, innings) {
    const inn1 = innings.find(i => i.innings_number === 1);
    const inn2 = innings.find(i => i.innings_number === 2);

    const teamABatFirst = inn1 && inn1.batting_team === 'A';
    const teamAScore = teamABatFirst ? inn1 : inn2;
    const teamBScore = teamABatFirst ? inn2 : inn1;

    const teamADisplay = teamAScore ? `${teamAScore.total_runs}<span class="wickets">/${teamAScore.total_wickets}</span>` : 'Yet to bat';
    const teamBDisplay = teamBScore ? `${teamBScore.total_runs}<span class="wickets">/${teamBScore.total_wickets}</span>` : 'Yet to bat';

    const teamAOvers = teamAScore ? `(${formatOvers(teamAScore.total_balls)} ov)` : '';
    const teamBOvers = teamBScore ? `(${formatOvers(teamBScore.total_balls)} ov)` : '';

    return `
        <div class="team-score">
            <div class="team-name">${match.team_a_name}</div>
            <div class="score-big">${teamADisplay}</div>
            <div class="overs-display">${teamAOvers}</div>
        </div>
        <div class="score-vs">VS</div>
        <div class="team-score">
            <div class="team-name">${match.team_b_name}</div>
            <div class="score-big">${teamBDisplay}</div>
            <div class="overs-display">${teamBOvers}</div>
        </div>
    `;
}

// ── Ball Dot Builder ──
function buildBallDot(delivery) {
    let cls = 'ball-0';
    let text = '•';

    if (delivery.is_wicket) {
        cls = 'ball-wicket';
        text = 'W';
    } else if (delivery.is_wide) {
        cls = 'ball-wide';
        text = 'Wd';
    } else if (delivery.is_noball) {
        cls = 'ball-noball';
        text = 'Nb';
    } else if (delivery.is_miss) {
        cls = 'ball-miss';
        text = 'M';
    } else if (delivery.is_boundary || delivery.runs_scored === 2) {
        cls = 'ball-boundary';
        text = delivery.runs_scored;
    } else if (delivery.runs_scored > 0) {
        cls = 'ball-run';
        text = delivery.runs_scored;
    }

    return `<div class="ball-dot ${cls}">${text}</div>`;
}

// ── Player Avatar Builder ──
function buildAvatar(name, color, size = '') {
    const initials = name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';
    const sizeClass = size === 'lg' ? 'player-avatar-lg' : '';
    return `<div class="player-avatar ${sizeClass}" style="background: ${color || 'var(--accent-primary)'}">${initials}</div>`;
}

// ── Player Chip Builder ──
function buildPlayerChip(player, selected = false, onClick = '') {
    return `<div class="player-chip ${selected ? 'selected' : ''}" data-id="${player.id}" onclick="${onClick}">
        ${buildAvatar(player.name, player.avatar_color)}
        <span>${player.name}</span>
    </div>`;
}

// ── Leaderboard Item Builder ──
function buildLeaderboardItem(player, rank, statValue, statLabel) {
    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    return `
        <div class="leaderboard-item">
            <div class="leaderboard-rank ${rankClass}">${rank}</div>
            ${buildAvatar(player.name, player.avatar_color)}
            <div class="leaderboard-info">
                <div class="leaderboard-name">${player.name}</div>
                <div class="leaderboard-sub">${statLabel}</div>
            </div>
            <div class="leaderboard-stat">${statValue}</div>
        </div>
    `;
}

// ── Dismissal Text (shows catcher/fielder name) ──
function getDismissalText(dismissal) {
    if (!dismissal) return 'not out';
    const fielder = dismissal.fielder_name || '';
    const bowler = dismissal.bowler_name || '?';
    const types = {
        bowled: `b ${bowler}`,
        caught_one_hand: fielder ? `c ${fielder} b ${bowler}` : `c & b ${bowler}`,
        run_out: `run out${fielder ? ` (${fielder})` : ''}`,
        stumped: `st b ${bowler}`,
        lbw: `lbw b ${bowler}`,
        hit_wicket: 'hit wicket',
        three_misses: '3 misses ✕✕✕',
        retired: 'retired'
    };
    return types[dismissal.dismissal_type] || dismissal.dismissal_type;
}

// ── Match Card Builder ──
function buildMatchCard(match) {
    const badgeClass = match.status === 'live' ? 'badge-live' : match.status === 'completed' ? 'badge-completed' : 'badge-upcoming';
    const badgeText = match.status === 'live' ? '🔴 LIVE' : match.status === 'completed' ? '✅ Completed' : '📅 Upcoming';
    
    const innings = match.innings || [];
    const scoreHtml = buildScoreDisplay(match, innings);
    
    let link = `/match?id=${match.id}`;
    const spectateBtn = match.status === 'live' ? `<a href="/match?id=${match.id}" class="btn btn-sm" style="margin-top: 8px;" onclick="event.stopPropagation();">👁️ Spectate Live</a>` : '';

    return `
        <div class="match-card" onclick="window.location='${link}'">
            <div class="match-card-header">
                <span class="match-status-badge ${badgeClass}">${badgeText}</span>
                <span class="match-date">${formatDate(match.created_at)}</span>
            </div>
            <div class="score-display" style="padding: var(--space-sm) 0;">${scoreHtml}</div>
            ${match.result ? `<div class="match-result">${match.result}</div>` : ''}
            ${spectateBtn}
        </div>
    `;
}

// ── URL Params ──
function getUrlParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}

// ── Socket.io ──
let socket = null;
function getSocket() {
    if (!socket && typeof io !== 'undefined') {
        socket = io();
    }
    return socket;
}
