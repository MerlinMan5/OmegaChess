const { Chess } = require('chess.js');
const { CARDS } = require('./cards');

const CARD_POOL = Object.values(CARDS);

function dealCards() {
  return [...CARD_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
}

function adjacent({ r, f }) {
  const res = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let df = -1; df <= 1; df++)
      if ((dr || df) && r+dr >= 0 && r+dr < 8 && f+df >= 0 && f+df < 8)
        res.push({ r: r+dr, f: f+df });
  return res;
}

function advanceFenTurn(fen, colorJustMoved) {
  const parts = fen.split(' ');
  const next = colorJustMoved === 'white' ? 'b' : 'w';
  parts[1] = next;
  if (next === 'w') parts[5] = String(parseInt(parts[5]) + 1);
  parts[4] = String(parseInt(parts[4]) + 1);
  parts[3] = '-';
  return parts.join(' ');
}

class GameRoom {
  constructor(id) {
    this.id = id;
    this.chess = new Chess();
    this.players = {};
    this.colors = {};
    this.fullMoves = 0;
    this.lastCardDealAt = 0;
    this.phase = 'waiting';
    this.cardPhase = null;
    this.activeEffects = [];
    this.pendingEffects = [];
    this.capturedPieces = { white: [], black: [] };
    this.skippedTurns = { white: 0, black: 0 };
    this.bonusMoves = { white: 0, black: 0 };
    this.actionQueue = [];
    this.awaitingAction = null;
    this.lastMove = null;        // { from, to } for highlighting
    this.disconnected = null;    // color of disconnected player
  }

  addPlayer(socketId, color) {
    this.players[socketId] = color;
    this.colors[color] = socketId;
    if (this.disconnected === color) this.disconnected = null;
    if (Object.keys(this.players).length === 2) this.phase = 'play';
  }

  removePlayer(socketId) {
    const color = this.players[socketId];
    delete this.players[socketId];
    if (color) {
      delete this.colors[color];
      this.disconnected = color;
    }
  }

  isFull() { return Object.keys(this.players).length >= 2; }
  isEmpty() { return Object.keys(this.players).length === 0; }
  getPlayerColor(socketId) { return this.players[socketId]; }
  getCurrentTurn() { return this.chess.turn() === 'w' ? 'white' : 'black'; }

  resetGame() {
    this.chess = new Chess();
    this.fullMoves = 0;
    this.lastCardDealAt = 0;
    this.phase = 'play';
    this.cardPhase = null;
    this.activeEffects = [];
    this.pendingEffects = [];
    this.capturedPieces = { white: [], black: [] };
    this.skippedTurns = { white: 0, black: 0 };
    this.bonusMoves = { white: 0, black: 0 };
    this.actionQueue = [];
    this.awaitingAction = null;
    this.lastMove = null;
  }

  passTurn(socketId) {
    const color = this.getPlayerColor(socketId);
    if (!color || color !== this.getCurrentTurn()) return { error: 'Not your turn' };
    if (this.skippedTurns[color] <= 0) return { error: 'Turn not frozen' };
    this.skippedTurns[color]--;
    this.lastMove = null;
    this.chess.load(advanceFenTurn(this.chess.fen(), color));
    this._afterMove(color);
    return { ok: true };
  }

  applyMove(socketId, move) {
    if (this.phase !== 'play') return { error: 'Not in play phase' };
    const color = this.getPlayerColor(socketId);
    if (!color) return { error: 'Not a player' };
    if (color !== this.getCurrentTurn()) return { error: 'Not your turn' };
    if (this.skippedTurns[color] > 0) return { error: 'Your turn is frozen — use Pass Turn' };

    const hobbit = this.activeEffects.find(e => e.cardId === 'HOBBIT_CHARGE');
    if (hobbit) {
      const piece = this.chess.get(move.from);
      if (!piece || piece.type !== 'p') return { error: 'Hobbit Charge: only pawns can move' };
    }

    let result = null;
    try { result = this.chess.move(move); } catch { /* fall through to special moves */ }

    if (!result) {
      const pawnRush = this.activeEffects.find(e => e.cardId === 'PAWN_RUSH' && e.color === color);
      if (pawnRush && this._isPawnRushMove(move.from, move.to, color))
        result = this._applySpecialMove(move.from, move.to, color);
    }
    if (!result) {
      const knightsDomain = this.activeEffects.find(e => e.cardId === 'KNIGHTS_DOMAIN' && e.color === color);
      if (knightsDomain && this._isKnightBishopMove(move.from, move.to, color))
        result = this._applySpecialMove(move.from, move.to, color);
    }
    if (!result) {
      const pacMan = this.activeEffects.find(e => e.cardId === 'PAC_MAN' && e.color === color);
      if (pacMan && this._isPacManWrap(move.from, move.to, color))
        result = this._applySpecialMove(move.from, move.to, color);
    }
    if (!result) return { error: 'Illegal move' };

    this.lastMove = { from: move.from, to: move.to };

    if (result.captured) {
      const capturedColor = color === 'white' ? 'black' : 'white';
      this.capturedPieces[capturedColor].push(result.captured);
      const nuclear = this.activeEffects.find(e => e.cardId === 'NUCLEAR_PAWN' && e.color === color);
      if (nuclear && result.piece === 'p') this._nukeAdjacent(move.to);
    }

    this._afterMove(color);
    return { ok: true };
  }

  _applySpecialMove(from, to, color) {
    const piece = this.chess.get(from);
    if (!piece) return null;
    const target = this.chess.get(to);
    const colorChar = color === 'white' ? 'w' : 'b';
    if (target?.color === colorChar) return null;
    if (target?.type === 'k') return null;
    this.chess.remove(from);
    this.chess.put(piece, to);
    this.chess.load(advanceFenTurn(this.chess.fen(), color));
    return { piece: piece.type, captured: target?.type || null, from, to };
  }

  _isPawnRushMove(from, to, color) {
    const piece = this.chess.get(from);
    if (!piece || piece.type !== 'p') return false;
    if (piece.color !== (color === 'white' ? 'w' : 'b')) return false;
    if (from[0] !== to[0]) return false;
    const fromRank = parseInt(from[1]);
    const toRank = parseInt(to[1]);
    const rankDiff = color === 'white' ? toRank - fromRank : fromRank - toRank;
    if (rankDiff !== 2) return false;
    const midRank = color === 'white' ? fromRank + 1 : fromRank - 1;
    if (this.chess.get(from[0] + midRank)) return false;
    if (this.chess.get(to)) return false;
    const startingRank = color === 'white' ? 2 : 7;
    if (fromRank === startingRank) return false;
    return true;
  }

  _isKnightBishopMove(from, to, color) {
    const piece = this.chess.get(from);
    if (!piece || piece.type !== 'n') return false;
    if (piece.color !== (color === 'white' ? 'w' : 'b')) return false;
    const fromFile = from.charCodeAt(0) - 97, fromRank = parseInt(from[1]) - 1;
    const toFile = to.charCodeAt(0) - 97, toRank = parseInt(to[1]) - 1;
    const df = Math.abs(toFile - fromFile), dr = Math.abs(toRank - fromRank);
    if (df !== dr || df === 0) return false;
    const fd = toFile > fromFile ? 1 : -1, rd = toRank > fromRank ? 1 : -1;
    for (let i = 1; i < df; i++) {
      const sq = String.fromCharCode(97 + fromFile + i*fd) + (fromRank + i*rd + 1);
      if (this.chess.get(sq)) return false;
    }
    return true;
  }

  _isPacManWrap(from, to, color) {
    const piece = this.chess.get(from);
    if (!piece || !['r','q'].includes(piece.type)) return false;
    if (piece.color !== (color === 'white' ? 'w' : 'b')) return false;
    const fromFile = from.charCodeAt(0) - 97, toFile = to.charCodeAt(0) - 97;
    if (from[1] !== to[1]) return false;
    if (!((fromFile === 0 && toFile === 7) || (fromFile === 7 && toFile === 0))) return false;
    const target = this.chess.get(to);
    if (target?.color === (color === 'white' ? 'w' : 'b')) return false;
    if (target?.type === 'k') return false;
    return true;
  }

  _afterMove(color) {
    this.activeEffects = this.activeEffects
      .map(e => ({ ...e, turnsRemaining: e.turnsRemaining - 1 }))
      .filter(e => e.turnsRemaining > 0);
    this.pendingEffects = this.pendingEffects.map(e => ({ ...e, turnsUntil: e.turnsUntil - 1 }));
    const triggered = this.pendingEffects.filter(e => e.turnsUntil <= 0);
    this.pendingEffects = this.pendingEffects.filter(e => e.turnsUntil > 0);
    for (const e of triggered) if (e.cardId === 'OMEGA_CHAD') this._triggerOmegaChad();

    if (this.bonusMoves[color] > 0) {
      this.bonusMoves[color]--;
      const parts = this.chess.fen().split(' ');
      parts[1] = color === 'white' ? 'w' : 'b';
      if (color === 'black') parts[5] = String(Math.max(1, parseInt(parts[5]) - 1));
      this.chess.load(parts.join(' '));
      return;
    }

    if (this.chess.turn() === 'w') this.fullMoves++;
    if (this.chess.isGameOver()) { this.phase = 'gameover'; return; }
    if (this.fullMoves > 0 && this.fullMoves % 3 === 0 && this.fullMoves !== this.lastCardDealAt) {
      this.lastCardDealAt = this.fullMoves;
      this._startCardPhase();
      return;
    }
    this._nextAwaitingOrPlay();
  }

  _nukeAdjacent(square) {
    const file = square.charCodeAt(0) - 97, rank = parseInt(square[1]) - 1;
    for (let df = -1; df <= 1; df++)
      for (let dr = -1; dr <= 1; dr++) {
        if (!df && !dr) continue;
        const f = file+df, r = rank+dr;
        if (f<0||f>7||r<0||r>7) continue;
        const sq = String.fromCharCode(97+f)+(r+1);
        const p = this.chess.get(sq);
        if (p && p.type !== 'k') this.chess.remove(sq);
      }
  }

  _triggerOmegaChad() {
    const board = this.chess.board();
    const kings = {};
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p?.type === 'k') kings[p.color] = { r, f };
      }
    if (!kings.w || !kings.b) return;
    const both = adjacent(kings.w).filter(a => adjacent(kings.b).some(b => b.r===a.r && b.f===a.f));
    for (const { r, f } of both) {
      const sq = String.fromCharCode(97+f)+(r+1);
      const p = this.chess.get(sq);
      if (p && p.type !== 'k') this.chess.remove(sq);
    }
  }

  _startCardPhase() {
    this.phase = 'card-selection';
    this.cardPhase = { hands: { white: dealCards(), black: dealCards() }, selections: { white: null, black: null } };
  }

  selectCard(socketId, cardId) {
    if (this.phase !== 'card-selection') return { error: 'Not in card selection' };
    const color = this.getPlayerColor(socketId);
    if (!color) return { error: 'Not a player' };
    if (this.cardPhase.selections[color]) return { error: 'Already selected' };
    if (!this.cardPhase.hands[color].find(c => c.id === cardId)) return { error: 'Card not in hand' };
    this.cardPhase.selections[color] = cardId;
    if (this.cardPhase.selections.white && this.cardPhase.selections.black) this._resolveCards();
    return { ok: true };
  }

  _resolveCards() {
    const selections = { ...this.cardPhase.selections };
    this.cardPhase = null;
    for (const color of ['white', 'black']) this._applyCard(selections[color], color);
    this._nextAwaitingOrPlay();
  }

  _applyCard(cardId, color) {
    const opp = color === 'white' ? 'black' : 'white';
    switch (cardId) {
      case 'DOUBLE_MOVE': this.bonusMoves[color]++; break;
      case 'TIME_FREEZE': this.skippedTurns[opp]++; break;
      case 'RESURRECTION':
        if (this.capturedPieces[color].length > 0) this.actionQueue.push({ type: 'resurrect', color });
        break;
      case 'SWAP_PLACES': this.actionQueue.push({ type: 'swap', color }); break;
      case 'OMEGA_CHAD': this.pendingEffects.push({ cardId, color, turnsUntil: 6 }); break;
      default: this.activeEffects.push({ cardId, color, turnsRemaining: CARDS[cardId].turns * 2 });
    }
  }

  _nextAwaitingOrPlay() {
    if (this.actionQueue.length > 0) {
      this.awaitingAction = this.actionQueue.shift();
      this.phase = 'awaiting-action';
    } else {
      this.awaitingAction = null;
      this.phase = 'play';
    }
  }

  applySwap(socketId, squares) {
    const color = this.getPlayerColor(socketId);
    if (!this.awaitingAction || this.awaitingAction.type !== 'swap' || this.awaitingAction.color !== color)
      return { error: 'Not awaiting swap from you' };
    const [sq1, sq2] = squares;
    const p1 = this.chess.get(sq1), p2 = this.chess.get(sq2);
    if (!p1 || !p2) return { error: 'Select two occupied squares' };
    const cc = color === 'white' ? 'w' : 'b';
    if (p1.color !== cc || p2.color !== cc) return { error: 'Can only swap your own pieces' };
    if (p1.type === 'k' || p2.type === 'k') return { error: "Can't swap the king" };
    this.chess.remove(sq1); this.chess.remove(sq2);
    this.chess.put(p1, sq2); this.chess.put(p2, sq1);
    this._nextAwaitingOrPlay();
    return { ok: true };
  }

  applyResurrection(socketId, square) {
    const color = this.getPlayerColor(socketId);
    if (!this.awaitingAction || this.awaitingAction.type !== 'resurrect' || this.awaitingAction.color !== color)
      return { error: 'Not awaiting resurrection from you' };
    if (!this.capturedPieces[color].length) return { error: 'No captured pieces' };
    if (this.chess.get(square)) return { error: 'Square is occupied' };
    const pieceType = this.capturedPieces[color][this.capturedPieces[color].length - 1];
    this.chess.put({ type: pieceType, color: color === 'white' ? 'w' : 'b' }, square);
    this.capturedPieces[color].pop();
    this._nextAwaitingOrPlay();
    return { ok: true };
  }

  getState() {
    return {
      fen: this.chess.fen(),
      turn: this.getCurrentTurn(),
      phase: this.phase,
      fullMoves: this.fullMoves,
      lastMove: this.lastMove,
      disconnected: this.disconnected,
      cardPhase: this.cardPhase ? {
        hands: this.cardPhase.hands,
        selections: { white: !!this.cardPhase.selections.white, black: !!this.cardPhase.selections.black },
      } : null,
      activeEffects: this.activeEffects,
      pendingEffects: this.pendingEffects,
      capturedPieces: this.capturedPieces,
      skippedTurns: this.skippedTurns,
      bonusMoves: this.bonusMoves,
      awaitingAction: this.awaitingAction,
      gameOver: this.chess.isGameOver(),
      inCheck: this.chess.inCheck(),
      isCheckmate: this.chess.isCheckmate(),
      isStalemate: this.chess.isStalemate(),
      players: { white: !!this.colors.white, black: !!this.colors.black },
    };
  }
}

module.exports = { GameRoom };
