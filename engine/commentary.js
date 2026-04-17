/**
 * Auto Commentary Generator
 * Generates natural-sounding ball-by-ball commentary
 */

const batterNames = {};
const bowlerNames = {};

function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate commentary for a delivery
 */
function generateCommentary(delivery, context) {
    const batter = context.batterName || 'Batter';
    const bowler = context.bowlerName || 'Bowler';
    const fielder = context.fielderName || 'Fielder';

    // Wicket
    if (delivery.is_wicket) {
        return generateWicketCommentary(delivery, context);
    }

    // Miss
    if (delivery.is_miss) {
        const missCount = context.missCount || 1;
        const missTemplates = [
            `${bowler} to ${batter}, complete miss! That's miss number ${missCount}.`,
            `Swing and a miss from ${batter}! ${missCount}/3 misses now.`,
            `${batter} misses that one completely. ${missCount} miss${missCount > 1 ? 'es' : ''} so far.`,
            `Big swing, no connection! ${batter} has ${missCount} miss${missCount > 1 ? 'es' : ''} now.`,
            `${bowler} beats ${batter} all ends up! Miss count: ${missCount}.`
        ];
        if (missCount >= 3) {
            return `${batter} misses for the third time — OUT! Three misses and ${batter} has to walk back.`;
        }
        return getRandomItem(missTemplates);
    }

    // Wide
    if (delivery.is_wide) {
        const wideTemplates = [
            `Wide ball! ${bowler} strays down the leg side.`,
            `That's wide from ${bowler}. Extra run added.`,
            `${bowler} bowls it wide outside off. Free run for the batting side.`,
            `Called wide! ${bowler} needs to tighten up the line.`
        ];
        return getRandomItem(wideTemplates);
    }

    // No ball
    if (delivery.is_noball) {
        const noballTemplates = [
            `No ball from ${bowler}! Free hit coming up.`,
            `${bowler} oversteps — no ball called.`,
            `That's a no ball! Extra run and a free hit.`
        ];
        return getRandomItem(noballTemplates);
    }

    // Boundary (2 runs — ball out of corridor)
    if (delivery.is_boundary) {
        const boundaryTemplates = [
            `BOUNDARY! ${batter} sends it flying out of the corridor! 2 runs.`,
            `That's gone! ${batter} smashes it out! Maximum runs — 2!`,
            `OUT OF THE CORRIDOR! ${batter} goes big and gets the full 2 runs!`,
            `Cracking shot from ${batter}! Ball's out of the corridor — 2 runs!`,
            `BANG! ${batter} muscles that one out of the corridor for 2!`
        ];
        return getRandomItem(boundaryTemplates);
    }

    // Runs
    if (delivery.runs_scored === 0) {
        const dotTemplates = [
            `${bowler} to ${batter}, dot ball! Good delivery.`,
            `Defended by ${batter}. No run.`,
            `${batter} pushes it back to ${bowler}. Dot ball.`,
            `Good length from ${bowler}, ${batter} can't score off that.`,
            `${bowler} keeps it tight. No run scored.`,
            `Solid defense from ${batter}. Dot.`
        ];
        return getRandomItem(dotTemplates);
    }

    if (delivery.runs_scored === 1) {
        const singleTemplates = [
            `${batter} touches the ball and gets safely through — 1 run!`,
            `Nicely played by ${batter}. Touch and run, single taken.`,
            `${batter} gets bat on ball and scampers through for 1.`,
            `Good cricket from ${batter}. Safe touch, easy single.`,
            `Deft touch from ${batter}, quick single taken.`,
            `${batter} nudges it and takes a comfortable single.`
        ];
        return getRandomItem(singleTemplates);
    }

    if (delivery.runs_scored === 2) {
        const doubleTemplates = [
            `${batter} smashes it out! 2 runs — maximum!`,
            `That's the maximum! ${batter} clears the corridor for 2.`,
            `Out of the corridor! ${batter} collects the maximum 2 runs.`
        ];
        return getRandomItem(doubleTemplates);
    }

    return `${bowler} to ${batter}, ${delivery.runs_scored} run(s).`;
}

/**
 * Generate commentary for wicket deliveries
 */
function generateWicketCommentary(delivery, context) {
    const batter = context.batterName || 'Batter';
    const bowler = context.bowlerName || 'Bowler';
    const fielder = context.fielderName || 'Fielder';
    const dismissalType = context.dismissalType || 'bowled';

    const templates = {
        bowled: [
            `BOWLED! ${bowler} cleans up ${batter}! The stumps are rattled!`,
            `Timber! ${bowler} knocks over ${batter}'s stumps! Beautiful delivery!`,
            `${batter} is BOWLED! ${bowler} is pumped! What a ball!`
        ],
        caught_one_hand: [
            `CAUGHT! One-step, one-hand! ${fielder} takes a screamer to dismiss ${batter}!`,
            `What a catch by ${fielder}! One hand, one step — ${batter} has to go!`,
            `OUT! Incredible one-hand grab from ${fielder}! ${batter} is gone!`,
            `${fielder} plucks it out of the air with one hand! ${batter} can't believe it!`
        ],
        run_out: [
            `RUN OUT! ${batter} was short of the crease! Direct hit!`,
            `${batter} is run out! Terrible call for a run there.`,
            `OUT! ${batter} is well short! Run out by ${fielder}!`
        ],
        stumped: [
            `STUMPED! ${batter} was out of the crease and the keeper whips the bails off!`,
            `${batter} is stumped! Too far down the track.`
        ],
        lbw: [
            `LBW! That's plumb! ${batter} is trapped in front by ${bowler}!`,
            `Huge appeal and given! ${batter} is LBW to ${bowler}!`
        ],
        hit_wicket: [
            `Hit wicket! ${batter} knocks the stumps over! Unfortunate dismissal!`,
            `Oh no! ${batter} has hit the wicket! That's an unlucky way to go.`
        ],
        three_misses: [
            `THREE MISSES! ${batter} is OUT! That's the third miss — rules are rules!`,
            `OUT! ${batter} misses for the third time! Three strikes and you're out!`,
            `${batter} swings and misses again — that's miss number 3! Has to walk back!`
        ],
        retired: [
            `${batter} retires. Good innings comes to an end.`,
            `${batter} walks off, retiring from the crease.`
        ]
    };

    const options = templates[dismissalType] || [`${batter} is out! ${dismissalType}.`];
    return getRandomItem(options);
}

/**
 * Generate end-of-over summary
 */
function generateOverSummary(overNumber, runsInOver, wicketsInOver, bowlerName) {
    const templates = [
        `End of over ${overNumber}: ${runsInOver} runs, ${wicketsInOver} wicket(s). Bowled by ${bowlerName}.`,
        `Over ${overNumber} done — ${runsInOver} off it. ${bowlerName} finishes ${wicketsInOver > 0 ? 'with ' + wicketsInOver + ' wicket(s)!' : 'without a wicket.'}`,
    ];
    return getRandomItem(templates);
}

/**
 * Generate match result commentary
 */
function generateResultCommentary(result) {
    if (result.includes('Tied')) {
        return `🏏 MATCH TIED! What a thriller in the corridor! Both teams gave it their all!`;
    }
    return `🏆 ${result}! What a game of corridor cricket!`;
}

module.exports = {
    generateCommentary,
    generateOverSummary,
    generateResultCommentary
};
