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
  }

  addPlayer(socketId, color) {
    this.players[socketId] = color;
    this.colors[color] = socketId;
    if (Object.keys(this.players).length === 2) this.phase = 'play';
  }

  removePlayer(socketId) {
    const color = this.players[socketId];
    delete this.players[socketId];
    if (color) delete this.colors[color];
  }

  isFull() { return Object.keys(this.players).length >= 2; }
  isEmpty() { return Object.keys(this.players).length === 0; }
  getPlayerColor(socketId) { return this.players[socketId]; }
  getCurrentTurn() { return this.chess.turn() === 'w' ? 'white' : 'black'; }

  passTurn(socketId) {
    const color = this.getPlayerColor(socketId);
    if (!color || color !== this.getCurrentTurn()) return { error: 'Not your turn' };
    if (this.skippedTurns[color] <= 0) return { error: 'Turn not frozen' };
    this.skippedTurns[color]--;
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

    let result;
    try { result = this.chess.move(move); } catch { return { error: 'Illegal move' }; }
    if (!result) return { error: 'Illegal move' };

    if (result.captured) {
      const capturedColor = color === 'white' ? 'black' : 'white';
      this.capturedPieces[capturedColor].push(result.captured);
      const nuclear = this.activeEffects.find(e => e.cardId === 'NUCLEAR_PAWN' && e.color === color);
      if (nuclear && result.piece === 'p') this._nukeAdjacent(result.to);
    }

    this._afterMove(color);
    return { ok: true };
  }

  _afterMove(color) {
    this.activeEffects = this.activeEffects
      .map(e => ({ ...e, turnsRemaining: e.turnsRemaining - 1 }))
      .filter(e => e.turnsRemaining > 0);

    this.pendingEffects = this.pendingEffects
      .map(e => ({ ...e, turnsUntil: e.turnsUntil - 1 }));

    const triggered = this.pendingEffects.filter(e => e.turnsUntil <= 0);
    this.pendingEffects = this.pendingEffects.filter(e => e.turnsUntil > 0);
    for (const e of triggered) {
      if (e.cardId === 'OMEGA_CHAD') this._triggerOmegaChad();
    }

    if (this.bonusMoves[color] > 0) {
      this.bonusMoves[color]--;
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
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1]) - 1;
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
    const adjW = adjacent(kings.w);
    const adjB = adjacent(kings.b);
    const both = adjW.filter(a => adjB.some(b => b.r===a.r && b.f===a.f));
    for (const { r, f } of both) {
      const sq = String.fromCharCode(97+f)+(r+1);
      const p = this.chess.get(sq);
      if (p && p.type !== 'k') this.chess.remove(sq);
    }
  }

  _startCardPhase() {
    this.phase = 'card-selection';
    this.cardPhase = {
      hands: { white: dealCards(), black: dealCards() },
      selections: { white: null, black: null },
    };
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
        if (this.capturedPieces[color].length > 0)
          this.actionQueue.push({ type: 'resurrect', color });
        break;
      case 'SWAP_PLACES':
        this.actionQueue.push({ type: 'swap', color });
        break;
      case 'OMEGA_CHAD':
        this.pendingEffects.push({ cardId, color, turnsUntil: 6 });
        break;
      default:
        this.activeEffects.push({ cardId, color, turnsRemaining: CARDS[cardId].turns * 2 });
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
      cardPhase: this.cardPhase ? {
        hands: this.cardPhase.hands,
        selections: {
          white: !!this.cardPhase.selections.white,
          black: !!this.cardPhase.selections.black,
        },
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
