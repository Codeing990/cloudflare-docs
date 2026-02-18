const {
  createInitialState,
  secureDiceRoll,
  isPlayerTurn,
  getMovablePieceIds,
  movePiece,
  advanceTurn,
  serializeState
} = require('./gameEngine');

class RoomManager {
  constructor({ turnTimeoutMs, inactivityForfeitMs, onGameFinished }) {
    this.rooms = new Map();
    this.turnTimeoutMs = turnTimeoutMs;
    this.inactivityForfeitMs = inactivityForfeitMs;
    this.onGameFinished = onGameFinished;
  }

  getOrCreateRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        roomId,
        players: [],
        sockets: new Map(),
        spectators: new Set(),
        game: null,
        createdAt: Date.now()
      });
    }
    return this.rooms.get(roomId);
  }

  joinRoom(roomId, user, ws) {
    const room = this.getOrCreateRoom(roomId);
    room.sockets.set(ws, { userId: user.id, username: user.username });

    const existing = room.players.find((p) => p.userId === user.id);
    if (!existing && room.players.length < 4 && !room.game) {
      room.players.push({ userId: user.id, username: user.username });
      this.maybeStart(room);
      return { role: 'player', room };
    }

    if (existing) return { role: 'player', room };

    room.spectators.add(user.id);
    return { role: 'spectator', room };
  }

  maybeStart(room) {
    if (!room.game && room.players.length >= 2) {
      room.game = createInitialState(room.roomId, room.players);
    }
  }

  leaveRoom(roomId, ws) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.sockets.delete(ws);
    if (room.sockets.size === 0 && (!room.game || room.game.status === 'finished')) {
      this.rooms.delete(roomId);
    }
  }

  getGameState(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room || !room.game) return null;
    return serializeState(room.game, userId);
  }

  rollDice(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room?.game) throw new Error('Game not started');
    const game = room.game;
    if (!isPlayerTurn(game, userId)) throw new Error('Not your turn');
    if (game.dice != null) throw new Error('Dice already rolled');

    const dice = secureDiceRoll();
    game.dice = dice;

    const moves = getMovablePieceIds(game, userId, dice);
    if (moves.length === 0) {
      game.lastAction = { type: 'roll', userId, dice, noMoves: true };
      game.dice = null;
      advanceTurn(game);
    } else {
      game.lastAction = { type: 'roll', userId, dice, noMoves: false };
    }
    game.lastMoveAt = Date.now();
    this.checkFinish(room);
    return serializeState(game, userId);
  }

  move(roomId, userId, pieceId) {
    const room = this.rooms.get(roomId);
    if (!room?.game) throw new Error('Game not started');
    const game = room.game;

    if (!isPlayerTurn(game, userId)) throw new Error('Not your turn');
    movePiece(game, userId, pieceId);
    this.checkFinish(room);
    return serializeState(game, userId);
  }

  postChat(roomId, userId, username, message) {
    const room = this.rooms.get(roomId);
    if (!room?.game) return;
    room.game.chat.push({ userId, username, message: message.slice(0, 240), at: Date.now() });
  }

  markActivity(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (!room?.game) return;
    const player = room.game.players.find((p) => p.userId === userId);
    if (player) player.lastActiveAt = Date.now();
  }

  tick(now = Date.now()) {
    for (const room of this.rooms.values()) {
      if (!room.game || room.game.status !== 'active') continue;
      const game = room.game;

      const current = game.players[game.turnIndex];
      if (current && now - game.turnStartedAt > this.turnTimeoutMs) {
        game.lastAction = { type: 'timeout', userId: current.userId };
        game.dice = null;
        advanceTurn(game);
      }

      for (const p of game.players) {
        if (p.finishedRank) continue;
        if (now - p.lastActiveAt > this.inactivityForfeitMs) {
          p.finishedRank = 99;
          game.lastAction = { type: 'forfeit', userId: p.userId };
        }
      }
      this.checkFinish(room);
    }
  }

  checkFinish(room) {
    if (room.game?.status === 'finished' && this.onGameFinished) {
      this.onGameFinished(room.game).catch(() => {});
    }
  }
}

module.exports = RoomManager;
