const bcrypt = require('bcrypt');
const { initializeDatabase, run, get } = require('./db');

async function seed() {
  await initializeDatabase();
  const users = [
    { username: 'admin', password: 'Admin@123', role: 'admin' },
    { username: 'alice', password: 'Password@1', role: 'player' },
    { username: 'bob', password: 'Password@1', role: 'player' }
  ];

  for (const u of users) {
    const exists = await get('SELECT id FROM users WHERE username = ?', [u.username]);
    if (exists) continue;
    const hash = await bcrypt.hash(u.password, 12);
    const r = await run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [u.username, hash, u.role]);
    await run('INSERT OR IGNORE INTO player_stats (user_id, wins, losses, total_games) VALUES (?, 0, 0, 0)', [r.lastID]);
  }

  console.log('Seeded users: admin/alice/bob');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
