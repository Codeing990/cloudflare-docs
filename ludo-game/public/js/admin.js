const tokenA = localStorage.getItem('token');
fetch('/api/admin/games', { headers: { Authorization: `Bearer ${tokenA}` } })
  .then((r) => r.json())
  .then((rows) => {
    const table = document.getElementById('games');
    table.innerHTML = '<tr><th>ID</th><th>Room</th><th>Status</th><th>Winner</th><th>Ended</th></tr>' +
      rows.map((r) => `<tr><td>${r.id}</td><td>${r.room_id}</td><td>${r.status}</td><td>${r.winner_user_id || '-'}</td><td>${r.ended_at || '-'}</td></tr>`).join('');
  });
