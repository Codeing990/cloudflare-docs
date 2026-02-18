const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { WebSocketServer } = require('ws');
const dotenv = require('dotenv');
const {
  initializeDatabase,
  run,
  get,
  all
} = require('./db');
const { register, login, authMiddleware, verifyWsToken } = require('./auth');
const RoomManager = require('./roomManager');
const logger = require('./logger');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const PORT = Number(process.env.PORT || 3000);
const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS || 30000);
const INACTIVITY_FORFEIT_MS = Number(process.env.INACTIVITY_FORFEIT_MS || 120000);
const WS_RATE_LIMIT_WINDOW_MS = Number(process.env.WS_RATE_LIMIT_WINDOW_MS || 10000);
const WS_RATE_LIMIT_MAX_MESSAGES = Number(process.env.WS_RATE_LIMIT_MAX_MESSAGES || 25);

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json({ limit: '128kb' }));
app.use(morgan('dev'));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 200 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 });
app.use('/api', apiLimiter);

const validUsername = /^[a-zA-Z0-9_]{3,20}$/;

function sanitizeRoomId(raw) {
  const room = String(raw || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{3,32}$/.test(room)) return null;
  return room;
}

const roomManager = new RoomManager({
  turnTimeoutMs: TURN_TIMEOUT_MS,
  inactivityForfeitMs: INACTIVITY_FORFEIT_MS,
  onGameFinished: async (game) => {
    if (game.saved) return;
    game.saved = true;

    const winner = game.winners[0] || null;
    const result = await run(
      'INSERT INTO games (room_id, status, started_at, ended_at, winner_user_id) VALUES (?, ?, ?, ?, ?)',
      [game.roomId, game.status, new Date(game.turnStartedAt).toISOString(), new Date().toISOString(), winner]
    );

    for (const player of game.players) {
      const rank = player.finishedRank || 99;
      const isWinner = winner === player.userId;
      await run(
        'INSERT INTO game_history (game_id, user_id, rank, result, turns_played) VALUES (?, ?, ?, ?, ?)',
        [result.lastID, player.userId, rank, isWinner ? 'win' : 'loss', 0]
      );
      await run(
        `INSERT INTO player_stats (user_id, wins, losses, total_games, updated_at)
         VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id) DO UPDATE SET
         wins = wins + excluded.wins,
         losses = losses + excluded.losses,
         total_games = total_games + 1,
         updated_at = CURRENT_TIMESTAMP`,
        [player.userId, isWinner ? 1 : 0, isWinner ? 0 : 1]
      );
    }
  }
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!validUsername.test(username || '') || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  try {
    const result = await register(username, password);
    return res.json(result);
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

  const result = await login(username, password);
  if (!result) return res.status(401).json({ error: 'Invalid credentials' });
  return res.json(result);
});

app.get('/api/profile', authMiddleware, async (req, res) => {
  const stats = await get('SELECT wins, losses, total_games FROM player_stats WHERE user_id = ?', [req.user.id]);
  return res.json({ user: req.user, stats: stats || { wins: 0, losses: 0, total_games: 0 } });
});

app.get('/api/leaderboard', async (_req, res) => {
  const rows = await all(
    `SELECT u.username, ps.wins, ps.losses, ps.total_games
     FROM player_stats ps
     JOIN users u ON u.id = ps.user_id
     ORDER BY ps.wins DESC, ps.total_games DESC
     LIMIT 100`
  );
  res.json(rows);
});

app.get('/api/history', authMiddleware, async (req, res) => {
  const rows = await all(
    `SELECT gh.id, gh.rank, gh.result, gh.created_at, g.room_id, g.id as game_id
     FROM game_history gh
     JOIN games g ON g.id = gh.game_id
     WHERE gh.user_id = ?
     ORDER BY gh.created_at DESC
     LIMIT 50`,
    [req.user.id]
  );
  res.json(rows);
});

app.get('/api/admin/games', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const rows = await all('SELECT * FROM games ORDER BY id DESC LIMIT 100');
  return res.json(rows);
});

app.use(express.static(path.resolve(__dirname, '../public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function broadcastRoom(room, payload) {
  room.sockets.forEach((_meta, sock) => send(sock, payload));
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  let user;
  try {
    user = verifyWsToken(token);
  } catch {
    send(ws, { type: 'error', message: 'Unauthorized' });
    ws.close();
    return;
  }

  ws.rate = { count: 0, windowStart: Date.now() };
  ws.user = user;
  ws.roomId = null;

  send(ws, { type: 'connected', user: { id: user.id, username: user.username, role: user.role } });

  ws.on('message', (raw) => {
    try {
      const now = Date.now();
      if (now - ws.rate.windowStart > WS_RATE_LIMIT_WINDOW_MS) {
        ws.rate.windowStart = now;
        ws.rate.count = 0;
      }
      ws.rate.count += 1;
      if (ws.rate.count > WS_RATE_LIMIT_MAX_MESSAGES) {
        send(ws, { type: 'error', message: 'Rate limit exceeded' });
        return;
      }

      const msg = JSON.parse(raw.toString());
      if (ws.roomId) roomManager.markActivity(ws.roomId, ws.user.id);

      if (msg.type === 'join_room') {
        const roomId = sanitizeRoomId(msg.roomId);
        if (!roomId) return send(ws, { type: 'error', message: 'Invalid room id' });

        ws.roomId = roomId;
        const result = roomManager.joinRoom(roomId, ws.user, ws);
        broadcastRoom(result.room, { type: 'room_update', roomId, role: result.role, state: roomManager.getGameState(roomId, ws.user.id) });
        return;
      }

      if (!ws.roomId) return send(ws, { type: 'error', message: 'Join room first' });
      const room = roomManager.getOrCreateRoom(ws.roomId);

      if (msg.type === 'roll_dice') {
        const state = roomManager.rollDice(ws.roomId, ws.user.id);
        broadcastRoom(room, { type: 'state', state });
      } else if (msg.type === 'move_piece') {
        if (typeof msg.pieceId !== 'string') return send(ws, { type: 'error', message: 'Invalid piece id' });
        const state = roomManager.move(ws.roomId, ws.user.id, msg.pieceId);
        broadcastRoom(room, { type: 'state', state });
      } else if (msg.type === 'chat') {
        const text = String(msg.message || '').trim();
        if (text.length < 1) return;
        roomManager.postChat(ws.roomId, ws.user.id, ws.user.username, text);
        const state = roomManager.getGameState(ws.roomId, ws.user.id);
        broadcastRoom(room, { type: 'state', state });
      } else if (msg.type === 'ping') {
        send(ws, { type: 'pong', now: Date.now() });
      }
    } catch (err) {
      logger.warn('WS handler error', { error: err.message, user: ws.user?.id });
      send(ws, { type: 'error', message: err.message || 'Bad request' });
    }
  });

  ws.on('close', () => {
    if (ws.roomId) roomManager.leaveRoom(ws.roomId, ws);
  });
});

setInterval(() => {
  roomManager.tick();
  for (const room of roomManager.rooms.values()) {
    if (room.game) {
      broadcastRoom(room, { type: 'state', state: roomManager.getGameState(room.roomId) });
    }
  }
}, 1000);

async function start() {
  await initializeDatabase();
  server.listen(PORT, () => {
    logger.info(`Ludo server running on http://localhost:${PORT}`);
    console.log(`Ludo server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  logger.error('Failed to start server', { error: err.message });
  console.error(err);
  process.exit(1);
});
