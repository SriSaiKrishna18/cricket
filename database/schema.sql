-- Corridor Cricket Database Schema

CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    avatar_color TEXT DEFAULT '#D4845A',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_a_name TEXT NOT NULL DEFAULT 'Team A',
    team_b_name TEXT NOT NULL DEFAULT 'Team B',
    total_overs INTEGER NOT NULL DEFAULT 5,
    toss_winner TEXT,
    toss_decision TEXT CHECK(toss_decision IN ('bat', 'bowl')),
    status TEXT DEFAULT 'upcoming' CHECK(status IN ('upcoming', 'live', 'completed', 'abandoned')),
    result TEXT,
    venue TEXT DEFAULT 'The Corridor',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME
);

CREATE TABLE IF NOT EXISTS match_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id),
    team TEXT NOT NULL CHECK(team IN ('A', 'B')),
    batting_order INTEGER,
    UNIQUE(match_id, player_id)
);

CREATE TABLE IF NOT EXISTS innings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    batting_team TEXT NOT NULL CHECK(batting_team IN ('A', 'B')),
    innings_number INTEGER NOT NULL CHECK(innings_number IN (1, 2)),
    total_runs INTEGER DEFAULT 0,
    total_wickets INTEGER DEFAULT 0,
    total_balls INTEGER DEFAULT 0,
    extras INTEGER DEFAULT 0,
    is_completed INTEGER DEFAULT 0,
    UNIQUE(match_id, innings_number)
);

CREATE TABLE IF NOT EXISTS deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    innings_id INTEGER NOT NULL REFERENCES innings(id) ON DELETE CASCADE,
    over_number INTEGER NOT NULL,
    ball_number INTEGER NOT NULL,
    bowler_id INTEGER NOT NULL REFERENCES players(id),
    batter_id INTEGER NOT NULL REFERENCES players(id),
    non_striker_id INTEGER REFERENCES players(id),
    runs_scored INTEGER DEFAULT 0 CHECK(runs_scored >= 0 AND runs_scored <= 2),
    extras_runs INTEGER DEFAULT 0,
    is_wide INTEGER DEFAULT 0,
    is_noball INTEGER DEFAULT 0,
    is_bye INTEGER DEFAULT 0,
    is_wicket INTEGER DEFAULT 0,
    is_miss INTEGER DEFAULT 0,
    is_boundary INTEGER DEFAULT 0,
    commentary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dismissals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_id INTEGER REFERENCES deliveries(id) ON DELETE CASCADE,
    innings_id INTEGER NOT NULL REFERENCES innings(id) ON DELETE CASCADE,
    batter_id INTEGER NOT NULL REFERENCES players(id),
    bowler_id INTEGER REFERENCES players(id),
    fielder_id INTEGER REFERENCES players(id),
    dismissal_type TEXT NOT NULL CHECK(dismissal_type IN (
        'bowled', 'caught_one_hand', 'run_out', 'stumped',
        'lbw', 'hit_wicket', 'three_misses', 'retired'
    )),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS batter_misses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    innings_id INTEGER NOT NULL REFERENCES innings(id) ON DELETE CASCADE,
    batter_id INTEGER NOT NULL REFERENCES players(id),
    miss_count INTEGER DEFAULT 0,
    UNIQUE(innings_id, batter_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_deliveries_innings ON deliveries(innings_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_batter ON deliveries(batter_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_bowler ON deliveries(bowler_id);
CREATE INDEX IF NOT EXISTS idx_match_players_match ON match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_innings_match ON innings(match_id);
CREATE INDEX IF NOT EXISTS idx_dismissals_innings ON dismissals(innings_id);
