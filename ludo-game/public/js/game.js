const token = localStorage.getItem('token');
if (!token) location.href = '/login.html';

const user = JSON.parse(localStorage.getItem('user') || '{}');
const profileEl = document.getElementById('profile');
const statusEl = document.getElementById('status');
const boardEl = document.getElementById('board');
const turnEl = document.getElementById('turn');
const diceValueEl = document.getElementById('diceValue');
const pieceButtonsEl = document.getElementById('pieceButtons');
const chatBox = document.getElementById('chatBox');

const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
let ws;
let roomId = null;
let reconnectTimer;

profileEl.textContent = `${user.username || 'Unknown'} (${user.role || 'player'})`;

function play(id) {
  const a = document.getElementById(id);
  if (a) a.play().catch(() => {});
}

function connect() {
  ws = new WebSocket(`${wsProtocol}://${location.host}/ws?token=${encodeURIComponent(token)}`);

  ws.onopen = () => {
    statusEl.textContent = 'Connected';
    if (roomId) ws.send(JSON.stringify({ type: 'join_room', roomId }));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'error') statusEl.textContent = data.message;
    if (data.type === 'room_update') play('sound-join');
    if (data.type === 'state') renderState(data.state);
  };

  ws.onclose = () => {
    statusEl.textContent = 'Disconnected. Reconnecting...';
    reconnectTimer = setTimeout(connect, 1500);
  };
}

function renderState(state) {
  if (!state) return;
  const me = state.players.find((p) => p.userId === user.id);
  const myPieces = me ? state.pieces[user.id] || [] : [];

  turnEl.textContent = `Current turn: ${state.turnUserId}`;
  diceValueEl.textContent = state.dice || '-';
  boardEl.textContent = JSON.stringify(state, null, 2);

  if (state.lastAction?.type === 'roll') play('sound-dice');
  if (state.lastAction?.type === 'move') play('sound-move');
  if (state.status === 'finished') {
    if (state.winners[0] === user.id) play('sound-win');
    else play('sound-lose');
  }

  pieceButtonsEl.innerHTML = '';
  for (const piece of myPieces) {
    const btn = document.createElement('button');
    btn.textContent = `${piece.id} (${piece.steps})`;
    btn.onclick = () => ws.send(JSON.stringify({ type: 'move_piece', pieceId: piece.id }));
    pieceButtonsEl.appendChild(btn);
  }

  chatBox.innerHTML = (state.chat || [])
    .map((m) => `<div><b>${m.username}:</b> ${m.message}</div>`)
    .join('');
}

document.getElementById('joinRoom').onclick = () => {
  roomId = document.getElementById('roomId').value.trim();
  if (!roomId) return;
  ws.send(JSON.stringify({ type: 'join_room', roomId }));
};

document.getElementById('rollDice').onclick = () => ws.send(JSON.stringify({ type: 'roll_dice' }));
document.getElementById('sendChat').onclick = () => {
  const input = document.getElementById('chatInput');
  ws.send(JSON.stringify({ type: 'chat', message: input.value }));
  input.value = '';
};

document.getElementById('logout').onclick = () => {
  clearTimeout(reconnectTimer);
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  location.href = '/login.html';
};

connect();
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
}, 5000);
