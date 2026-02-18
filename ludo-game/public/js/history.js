const tokenH = localStorage.getItem('token');
fetch('/api/history', { headers: { Authorization: `Bearer ${tokenH}` } })
  .then((r) => r.json())
  .then((rows) => {
    const table = document.getElementById('history');
    table.innerHTML = '<tr><th>Game</th><th>Room</th><th>Rank</th><th>Result</th><th>Date</th></tr>' +
      rows.map((r) => `<tr><td>${r.game_id}</td><td>${r.room_id}</td><td>${r.rank}</td><td>${r.result}</td><td>${r.created_at}</td></tr>`).join('');
  });
