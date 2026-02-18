const crypto = require('crypto');

const COLORS = ['red', 'green', 'yellow', 'blue'];
const START_INDEX = { red: 0, green: 13, yellow: 26, blue: 39 };
const SAFE_GLOBAL = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const PIECES_PER_PLAYER = 4;
const FINAL_STEP = 57;

function secureDiceRoll() {
  return crypto.randomInt(1, 7);
}

function createInitialState(roomId, players) {
  const activePlayers = players.slice(0, 4).map((player, idx) => ({
    ...player,
    color: COLORS[idx],
    finishedRank: null,
    connected: true,
    lastActiveAt: Date.now()
  }));

  const pieces = Object.fromEntries(
    activePlayers.map((p) => [
      p.userId,
      Array.from({ length: PIECES_PER_PLAYER }).map((_, i) => ({ id: `${p.color}-${i}`, steps: -1, finished: false }))
    ])
  );

  return {
    roomId,
    status: 'active',
    players: activePlayers,
    turnIndex: 0,
    dice: null,
    pieces,
    winners: [],
    lastMoveAt: Date.now(),
    chat: [],
    turnStartedAt: Date.now(),
    lastAction: null
  };
}

function isPlayerTurn(state, userId) {
  return state.players[state.turnIndex]?.userId === userId;
}

function getGlobalPosition(color, steps) {
  if (steps < 0 || steps > 51) return null;
  return (START_INDEX[color] + steps) % 52;
}

function canMovePiece(piece, dice) {
  if (piece.finished) return false;
  if (piece.steps === -1) return dice === 6;
  return piece.steps + dice <= FINAL_STEP;
}

function getMovablePieceIds(state, userId, dice) {
  return state.pieces[userId]
    .filter((piece) => canMovePiece(piece, dice))
    .map((piece) => piece.id);
}

function movePiece(state, userId, pieceId) {
  const player = state.players.find((p) => p.userId === userId);
  const piece = state.pieces[userId].find((p) => p.id === pieceId);

  if (!player || !piece || state.dice == null) {
    throw new Error('Invalid move context');
  }

  if (!canMovePiece(piece, state.dice)) {
    throw new Error('Illegal move');
  }

  const dice = state.dice;
  if (piece.steps === -1 && dice === 6) piece.steps = 0;
  else piece.steps += dice;

  if (piece.steps === FINAL_STEP) piece.finished = true;

  let kill = null;
  const victim = findKillTarget(state, userId, player.color, piece.steps);
  if (victim) {
    const victimPiece = state.pieces[victim.userId].find((p) => p.id === victim.pieceId);
    victimPiece.steps = -1;
    victimPiece.finished = false;
    kill = victim;
  }

  if (state.pieces[userId].every((p) => p.finished) && !state.winners.includes(userId)) {
    state.winners.push(userId);
    const rank = state.winners.length;
    const playerObj = state.players.find((p) => p.userId === userId);
    playerObj.finishedRank = rank;
  }

  state.lastAction = {
    type: 'move',
    userId,
    pieceId,
    dice,
    kill
  };
  state.lastMoveAt = Date.now();

  const extraTurn = dice === 6 || Boolean(kill);
  state.dice = null;
  if (!extraTurn) advanceTurn(state);
  else state.turnStartedAt = Date.now();
}

function findKillTarget(state, attackerUserId, color, steps) {
  if (steps < 0 || steps > 51) return null;
  const global = getGlobalPosition(color, steps);
  if (SAFE_GLOBAL.has(global)) return null;

  for (const player of state.players) {
    if (player.userId === attackerUserId) continue;
    for (const piece of state.pieces[player.userId]) {
      if (piece.steps < 0 || piece.steps > 51) continue;
      const pGlobal = getGlobalPosition(player.color, piece.steps);
      if (pGlobal === global) return { userId: player.userId, pieceId: piece.id };
    }
  }
  return null;
}

function advanceTurn(state) {
  const active = state.players.filter((p) => !p.finishedRank);
  if (active.length <= 1) {
    state.status = 'finished';
    const remaining = state.players.find((p) => !p.finishedRank);
    if (remaining && !state.winners.includes(remaining.userId)) {
      state.winners.push(remaining.userId);
      remaining.finishedRank = state.winners.length;
    }
    return;
  }

  let guard = 0;
  do {
    state.turnIndex = (state.turnIndex + 1) % state.players.length;
    guard += 1;
  } while (state.players[state.turnIndex].finishedRank && guard <= state.players.length + 1);

  state.turnStartedAt = Date.now();
}

function serializeState(state, perspectiveUserId = null) {
  return {
    roomId: state.roomId,
    status: state.status,
    players: state.players,
    turnUserId: state.players[state.turnIndex]?.userId,
    dice: state.dice,
    movablePieces: perspectiveUserId && state.dice ? getMovablePieceIds(state, perspectiveUserId, state.dice) : [],
    pieces: state.pieces,
    winners: state.winners,
    turnStartedAt: state.turnStartedAt,
    lastAction: state.lastAction,
    chat: state.chat.slice(-50)
  };
}

module.exports = {
  secureDiceRoll,
  createInitialState,
  isPlayerTurn,
  getMovablePieceIds,
  movePiece,
  advanceTurn,
  serializeState
};
