# 🏏 Corridor Cricket

**Real-time cricket scoring app for corridor cricket matches.** Score matches, track stats, compete on leaderboards — just like Cricbuzz, but for your corridor!

## Features

- 🔴 **Live Scoring** — Real-time score updates via WebSocket
- 📊 **Full Scorecards** — Batting, bowling, fall of wickets, partnerships
- 💬 **Auto Commentary** — Ball-by-ball commentary auto-generated
- 📈 **Rich Visualizations** — Manhattan charts, run rate graphs, partnership bars
- 🏆 **Leaderboards** — Orange Cap, Purple Cap, Strike Rate, Economy, Catches
- 📖 **Records** — Highest scores, best bowling, team records
- ⚔️ **Head-to-Head** — Compare any two players
- 📱 **Responsive** — Works on phone and desktop

## Corridor Cricket Rules

| Rule | Description |
|------|-------------|
| 🏏 Touch & Safe | Batter touches ball and is safe = 1 run |
| 🔥 Max 2 Runs | Ball goes out of corridor = 2 runs (max per ball) |
| ✋ One-Hand Catch | One-step, one-hand catch = OUT |
| ✕✕✕ Three Misses | Batter misses 3 times in an innings = OUT |

## Quick Start

```bash
npm install
npm start
# Open http://localhost:3000
```

## Tech Stack

- **Backend:** Node.js, Express, Socket.io
- **Database:** SQLite (sql.js — zero config)
- **Frontend:** Vanilla HTML/CSS/JS, Chart.js
- **Design:** Atmospheric light palette, glassmorphism

## Pages

| Page | URL | Description |
|------|-----|-------------|
| Dashboard | `/` | Live match, stats overview, player management |
| New Match | `/new-match` | Team setup, player selection, coin toss |
| Live Match | `/match?id=X` | Spectator view with scorecard & charts |
| Scoring | `/scoring?id=X` | Scorer's panel with action buttons |
| Stats | `/stats` | Individual player statistics |
| History | `/history` | All matches with filters |
| Leaderboard | `/leaderboard` | Rankings and records |

## Deploy

### Render (Recommended)
1. Connect this repo on [render.com](https://render.com)
2. It auto-detects the `render.yaml` config
3. Deploy — done!

### Railway
1. Connect repo on [railway.app](https://railway.app)
2. Set start command: `npm start`
3. Deploy

---

Built for the corridor legends 🏏🔥
