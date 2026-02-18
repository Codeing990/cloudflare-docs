const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const dotenv = require('dotenv');
const { get, run } = require('./db');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

async function register(username, password) {
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
  await run('INSERT OR IGNORE INTO player_stats (user_id, wins, losses, total_games) VALUES (?, 0, 0, 0)', [result.lastID]);
  const user = await get('SELECT id, username, role FROM users WHERE id = ?', [result.lastID]);
  return { user, token: signToken(user) };
}

async function login(username, password) {
  const user = await get('SELECT id, username, role, password_hash FROM users WHERE username = ?', [username]);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;
  return {
    user: { id: user.id, username: user.username, role: user.role },
    token: signToken(user)
  };
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function verifyWsToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  register,
  login,
  authMiddleware,
  verifyWsToken
};
