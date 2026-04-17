/**
 * Match History Page Logic
 */

let allMatches = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadAllMatches();
});

async function loadAllMatches() {
    try {
        allMatches = await apiGet('/api/matches');
        renderMatches(allMatches);
    } catch (err) {
        showToast('Failed to load matches', 'error');
    }
}

function renderMatches(matches) {
    const container = document.getElementById('matches-list');
    
    if (matches.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: span 2;">
                <div class="icon">📜</div>
                <h3>No matches found</h3>
                <p>Start a new match to see it here!</p>
                <a href="/new-match" class="btn btn-primary mt-md">🏏 New Match</a>
            </div>
        `;
        return;
    }

    container.innerHTML = matches.map(m => buildMatchCard(m)).join('');
}

function filterMatches(status, btn) {
    // Update button states
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    if (status === 'all') {
        renderMatches(allMatches);
    } else {
        renderMatches(allMatches.filter(m => m.status === status));
    }
}
