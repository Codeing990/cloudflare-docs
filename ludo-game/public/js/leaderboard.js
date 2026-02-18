fetch('/api/leaderboard')
  .then((r) => r.json())
  .then((rows) => {
    const table = document.getElementById('lb');
    table.innerHTML = '<tr><th>User</th><th>Wins</th><th>Losses</th><th>Total</th></tr>' +
      rows.map((r) => `<tr><td>${r.username}</td><td>${r.wins}</td><td>${r.losses}</td><td>${r.total_games}</td></tr>`).join('');
  });
