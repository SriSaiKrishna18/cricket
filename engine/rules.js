/**
 * Corridor Cricket Rules Engine
 * Enforces custom corridor cricket rules + standard cricket rules
 */

const MAX_RUNS_PER_BALL = 2;
const MISSES_FOR_OUT = 3;

/**
 * Validate and cap runs scored on a delivery
 */
function validateRuns(runs) {
    if (runs < 0) return 0;
    if (runs > MAX_RUNS_PER_BALL) return MAX_RUNS_PER_BALL;
    return runs;
}

/**
 * Check if a delivery is legal (not wide/noball)
 */
function isLegalDelivery(delivery) {
    return !delivery.is_wide && !delivery.is_noball;
}

/**
 * Calculate ball number in over (1-6)
 */
function getBallInOver(totalLegalBalls) {
    return (totalLegalBalls % 6) || 6;
}

/**
 * Calculate current over number (0-indexed)
 */
function getOverNumber(totalLegalBalls) {
    return Math.floor((totalLegalBalls) / 6);
}

/**
 * Format overs display (e.g., "3.4" means 3 overs and 4 balls)
 */
function formatOvers(totalLegalBalls) {
    const overs = Math.floor(totalLegalBalls / 6);
    const balls = totalLegalBalls % 6;
    return `${overs}.${balls}`;
}

/**
 * Check if innings is complete
 */
function isInningsComplete(innings, matchOvers, teamPlayerCount) {
    const totalBalls = matchOvers * 6;
    const maxWickets = Math.max(teamPlayerCount - 1, 1);
    
    // All overs bowled
    if (innings.total_balls >= totalBalls) return true;
    
    // All out
    if (innings.total_wickets >= maxWickets) return true;
    
    return false;
}

/**
 * Check if target is chased (2nd innings)
 */
function isTargetChased(battingTotal, target) {
    return battingTotal >= target;
}

/**
 * Process a miss — returns { missCount, isOut }
 */
function processMiss(currentMissCount) {
    const newCount = currentMissCount + 1;
    return {
        missCount: newCount,
        isOut: newCount >= MISSES_FOR_OUT
    };
}

/**
 * Determine match result
 */
function determineResult(match, innings1, innings2) {
    if (!innings1 || !innings2) return null;
    
    const team1 = match.toss_decision === 'bat' ? match.toss_winner : 
        (match.toss_winner === match.team_a_name ? match.team_b_name : match.team_a_name);
    const team2 = team1 === match.team_a_name ? match.team_b_name : match.team_a_name;

    const firstBattingTeamName = innings1.batting_team === 'A' ? match.team_a_name : match.team_b_name;
    const secondBattingTeamName = innings2.batting_team === 'A' ? match.team_a_name : match.team_b_name;
    
    if (innings1.total_runs > innings2.total_runs) {
        const margin = innings1.total_runs - innings2.total_runs;
        return `${firstBattingTeamName} won by ${margin} run${margin !== 1 ? 's' : ''}`;
    } else if (innings2.total_runs > innings1.total_runs) {
        const totalOvers = match.total_overs * 6;
        const ballsRemaining = totalOvers - innings2.total_balls;
        const teamPlayers = getTeamPlayerCount(match, innings2.batting_team);
        const wicketsLeft = Math.max(teamPlayers - 1, 1) - innings2.total_wickets;
        return `${secondBattingTeamName} won by ${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}`;
    } else {
        return 'Match Tied!';
    }
}

function getTeamPlayerCount(match, team) {
    // This will be injected from the route
    return match._teamPlayerCount || 2;
}

/**
 * Calculate required run rate
 */
function calculateRRR(target, currentScore, ballsRemaining) {
    if (ballsRemaining <= 0) return 0;
    const runsNeeded = target - currentScore;
    if (runsNeeded <= 0) return 0;
    const oversRemaining = ballsRemaining / 6;
    return (runsNeeded / oversRemaining).toFixed(2);
}

/**
 * Calculate current run rate
 */
function calculateCRR(runs, balls) {
    if (balls === 0) return '0.00';
    return ((runs / balls) * 6).toFixed(2);
}

/**
 * Get all valid dismissal types
 */
function getDismissalTypes() {
    return [
        { value: 'bowled', label: 'Bowled' },
        { value: 'caught_one_hand', label: 'Caught (One-hand)' },
        { value: 'run_out', label: 'Run Out' },
        { value: 'stumped', label: 'Stumped' },
        { value: 'lbw', label: 'LBW' },
        { value: 'hit_wicket', label: 'Hit Wicket' },
        { value: 'three_misses', label: '3 Misses' },
        { value: 'retired', label: 'Retired' }
    ];
}

module.exports = {
    MAX_RUNS_PER_BALL,
    MISSES_FOR_OUT,
    validateRuns,
    isLegalDelivery,
    getBallInOver,
    getOverNumber,
    formatOvers,
    isInningsComplete,
    isTargetChased,
    processMiss,
    determineResult,
    calculateRRR,
    calculateCRR,
    getDismissalTypes
};
