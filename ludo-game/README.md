# Real-Time Multiplayer Ludo Game

Production-ready Node.js + WebSocket + SQLite Ludo game with server-authoritative game logic.

## Architecture

- **Backend:** Express + `ws`
- **DB:** SQLite (`database/ludo.db`)
- **Frontend:** HTML/CSS/Vanilla JS
- **Auth:** JWT + bcrypt
- **Security:** helmet, API/WS rate limiting, input validation, server-side move validation

## Project structure

```
ludo-game/
├── server/
├── public/
├── database/
└── .env.example
```

## Setup

1. Install dependencies
   ```bash
   cd ludo-game
   npm install
   ```
2. Configure environment
   ```bash
   cp .env.example .env
   ```
3. Initialize sample data
   ```bash
   npm run seed
   ```
4. Start dev server
   ```bash
   npm run dev
   ```

## Sample accounts

- `admin` / `Admin@123`
- `alice` / `Password@1`
- `bob` / `Password@1`

## Feature checklist

- [x] Multi-room + up to 4 players
- [x] Auto-start game with 2+ players
- [x] Server authoritative turn/dice/move validation
- [x] Kill logic + safe zones + win ranking
- [x] Turn timer + inactivity forfeit
- [x] JWT authentication + profile stats
- [x] Leaderboard page
- [x] Game history page
- [x] Admin panel
- [x] Chat
- [x] WebSocket reconnect logic
- [x] Logging system (`logs/server.log`)

## Notes

- Add your own `dice.mp3`, `move.mp3`, `win.mp3`, `lose.mp3`, `join.mp3` files under `public/sounds/`.
- For production, run behind a reverse proxy with TLS and set a strong `JWT_SECRET`.
