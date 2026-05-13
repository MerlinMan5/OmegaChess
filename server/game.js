const { Chess } = require('chess.js');
const { CARDS } = require('./cards');

const CARD_POOL = Object.values(CARDS);

function dealCards() {
  return [...CARD_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
}

// ── Bot evaluation ────────────────────────────────────────────────────────────
const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const PST = {
  p: [
    [ 0,  0,  0,  0,  0,  0,  0,  0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [ 5,  5, 10, 25, 25, 10,  5,  5],
    [ 0,  0,  0, 20, 20,  0,  0,  0],
    [ 5, -5,-10,  0,  0,-10, -5,  5],
    [ 5, 10, 10,-20,-20, 10, 10,  5],
    [ 0,  0,  0,  0,  0,  0,  0,  0],
  ],
  n: [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50],
  ],
  b: [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10],
    [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20],
  ],
  r: [
    [ 0,  0,  0,  0,  0,  0,  0,  0],
    [ 5, 10, 10, 10, 10, 10, 10,  5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [ 0,  0,  0,  5,  5,  0,  0,  0],
  ],
  q: [
    [-20,-10,-10, -5, -5,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5,  5,  5,  5,  0,-10],
    [ -5,  0,  5,  5,  5,  5,  0, -5],
    [  0,  0,  5,  5,  5,  5,  0, -5],
    [-10,  5,  5,  5,  5,  5,  0,-10],
    [-10,  0,  5,  0,  0,  0,  0,-10],
    [-20,-10,-10, -5, -5,-10,-10,-20],
  ],
  k: [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [ 20, 20,  0,  0,  0,  0, 20, 20],
    [ 20, 30, 10,  0,  0, 10, 30, 20],
  ],
};

function evalBoard(chess, botColorChar) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = chess.board()[r][f];
      if (!p) continue;
      const pstRow = p.color === 'w' ? r : 7 - r;
      const val = (PIECE_VALUE[p.type] || 0) + (PST[p.type]?.[pstRow]?.[f] ?? 0);
      score += p.color === botColorChar ? val : -val;
    }
  }
  return score;
}

// Depth-1 greedy (medium difficulty)
function pickBotMoveMedium(chess, botColorChar, hobbitActive = false) {
  let moves = chess.moves({ verbose: true });
  if (hobbitActive) moves = moves.filter(m => m.piece === 'p');
  if (!moves.length) return null;
  let bestScore = -Infinity;
  let best = [];
  for (const m of moves) {
    chess.move(m);
    let score;
    if (chess.isCheckmate())      score = 1_000_000;
    else if (chess.isStalemate()) score = -50_000;
    else {
      score = evalBoard(chess, botColorChar);
      if (chess.inCheck()) score += 30;
    }
    chess.undo();
    score += (Math.random() - 0.5) * 10;
    if (score > bestScore) { bestScore = score; best = [m]; }
    else if (score === bestScore) best.push(m);
  }
  return best[Math.floor(Math.random() * best.length)];
}

// Minimax with alpha-beta (hard difficulty, 3-ply look-ahead)
function minimax(chess, depth, alpha, beta, maximizing, botColorChar) {
  if (chess.isGameOver()) {
    if (chess.isCheckmate()) return maximizing ? -900_000 : 900_000;
    return 0;
  }
  if (depth === 0) return evalBoard(chess, botColorChar);
  const moves = chess.moves({ verbose: true });
  // Move ordering: captures first to improve pruning
  moves.sort((a, b) => (b.flags.includes('c') ? 1 : 0) - (a.flags.includes('c') ? 1 : 0));
  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      chess.move(m);
      best = Math.max(best, minimax(chess, depth - 1, alpha, beta, false, botColorChar));
      chess.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      chess.move(m);
      best = Math.min(best, minimax(chess, depth - 1, alpha, beta, true, botColorChar));
      chess.undo();
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function pickBotMoveHard(chess, botColorChar, hobbitActive = false) {
  let moves = chess.moves({ verbose: true });
  if (hobbitActive) moves = moves.filter(m => m.piece === 'p');
  if (!moves.length) return null;
  moves.sort((a, b) => (b.flags.includes('c') ? 1 : 0) - (a.flags.includes('c') ? 1 : 0));
  let bestScore = -Infinity;
  let best = [];
  for (const m of moves) {
    chess.move(m);
    const score = minimax(chess, 2, -Infinity, Infinity, false, botColorChar);
    chess.undo();
    if (score > bestScore) { bestScore = score; best = [m]; }
    else if (score === bestScore) best.push(m);
  }
  return best[Math.floor(Math.random() * best.length)];
}
// ─────────────────────────────────────────────────────────────────────────────

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
    this.lastMove = null;
    this.disconnected = null;
    this.botColor = null;
    this.botDifficulty = 'medium';
    this.onBotAction = null;
    // Resignation / draw
    this.isResignation = false;
    this.resignedColor = null;
    this.drawOffer = null;       // { from: color } | null
    this.isDraw = false;
    this.lastEvent = null;       // { type, ... } — cleared each move, used for UI notifications
    this.fastMode = false;       // set true in tests to skip bot delays
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

  addBot(color, difficulty = 'medium') {
    this.players['__bot__'] = color;
    this.colors[color] = '__bot__';
    this.botColor = color;
    this.botDifficulty = difficulty;
    if (Object.keys(this.players).length === 2) this.phase = 'play';
  }

  _scheduleBotTurn() {
    if (!this.botColor || !this.onBotAction) return;
    const needsCard = this.phase === 'card-selection' && this.cardPhase && !this.cardPhase.selections[this.botColor];
    const needsAction = this.phase === 'awaiting-action' && this.awaitingAction?.color === this.botColor;
    const needsMove = this.phase === 'play' && this.getCurrentTurn() === this.botColor;
    if (!needsCard && !needsAction && !needsMove) return;
    if (this.fastMode) { setImmediate(() => this._doBotTurn()); return; }
    // Hard bot thinks longer
    const delay = this.botDifficulty === 'hard' ? 800 + Math.random() * 700 : 500 + Math.random() * 600;
    setTimeout(() => this._doBotTurn(), delay);
  }

  _doBotTurn() {
    if (!this.botColor || !this.onBotAction) return;
    const color = this.botColor;

    if (this.phase === 'card-selection' && this.cardPhase && !this.cardPhase.selections[color]) {
      const hand = this.cardPhase.hands[color];
      const card = hand[Math.floor(Math.random() * hand.length)];
      if (this.selectCard('__bot__', card.id).ok) this.onBotAction();
      return;
    }

    if (this.phase === 'awaiting-action' && this.awaitingAction?.color === color) {
      const { type } = this.awaitingAction;
      const board = this.chess.board();
      const cc = color === 'white' ? 'w' : 'b';
      if (type === 'swap') {
        const pieces = [];
        for (let r = 0; r < 8; r++)
          for (let f = 0; f < 8; f++)
            if (board[r][f]?.color === cc && board[r][f]?.type !== 'k')
              pieces.push(String.fromCharCode(97+f)+(r+1));
        let swapped = false;
        if (pieces.length >= 2) {
          pieces.sort(() => Math.random() - 0.5);
          for (let i = 0; i < pieces.length - 1; i++) {
            if (this.applySwap('__bot__', [pieces[i], pieces[i+1]]).ok) { swapped = true; break; }
          }
        }
        if (!swapped) {
          // Can't swap — skip the action and continue
          this._nextAwaitingOrPlay();
        }
      } else if (type === 'resurrect') {
        const empty = [];
        for (let r = 0; r < 8; r++)
          for (let f = 0; f < 8; f++)
            if (!board[r][f]) empty.push(String.fromCharCode(97+f)+(r+1));
        let resurrected = false;
        if (empty.length) {
          const sq = empty[Math.floor(Math.random() * empty.length)];
          resurrected = this.applyResurrection('__bot__', sq).ok;
        }
        if (!resurrected) this._nextAwaitingOrPlay();
      } else {
        // Unknown action type — skip it
        this._nextAwaitingOrPlay();
      }
      this.onBotAction();
      return;
    }

    if (this.phase !== 'play' || this.getCurrentTurn() !== color || this.chess.isGameOver()) return;

    if (this.skippedTurns[color] > 0) {
      if (this.passTurn('__bot__').ok) this.onBotAction();
      return;
    }

    const cc = color === 'white' ? 'w' : 'b';
    const hobbitActive = this.activeEffects.some(e => e.cardId === 'HOBBIT_CHARGE');
    let m;
    if (this.botDifficulty === 'easy') {
      let moves = this.chess.moves({ verbose: true });
      if (hobbitActive) moves = moves.filter(mv => mv.piece === 'p');
      m = moves[Math.floor(Math.random() * moves.length)];
    } else if (this.botDifficulty === 'hard') {
      m = pickBotMoveHard(this.chess, cc, hobbitActive);
    } else {
      m = pickBotMoveMedium(this.chess, cc, hobbitActive);
    }
    if (!m) {
      // No legal moves — game should be over (checkmate/stalemate detected on next check)
      if (!this.chess.isGameOver()) this.phase = 'gameover';
      this.onBotAction();
      return;
    }
    const move = { from: m.from, to: m.to };
    if (m.promotion) move.promotion = 'q';
    const result = this.applyMove('__bot__', move);
    if (result.ok) {
      this.onBotAction();
    } else {
      // Move failed unexpectedly — fall back to a random legal move
      const fallback = this.chess.moves({ verbose: true });
      const fm = fallback[Math.floor(Math.random() * fallback.length)];
      if (fm && this.applyMove('__bot__', { from: fm.from, to: fm.to }).ok) {
        this.onBotAction();
      } else {
        // Truly stuck — end the game gracefully
        if (!this.chess.isGameOver()) this.phase = 'gameover';
        this.onBotAction();
      }
    }
  }

  isFull() { return Object.keys(this.players).length >= 2; }
  isEmpty() { return Object.keys(this.players).length === 0; }
  getPlayerColor(socketId) { return this.players[socketId]; }
  getCurrentTurn() { return this.chess.turn() === 'w' ? 'white' : 'black'; }

  // Returns legal moves for the current position, filtered by active card effects
  getLegalMoves() {
    let moves = this.chess.moves({ verbose: true });
    if (this.activeEffects.some(e => e.cardId === 'HOBBIT_CHARGE'))
      moves = moves.filter(m => m.piece === 'p');
    return moves;
  }

  // Returns true if colorChar's king is currently in check in this position
  _kingInCheck(colorChar) {
    const fen = this.chess.fen();
    const parts = fen.split(' ');
    parts[1] = colorChar;
    const temp = new Chess();
    try { temp.load(parts.join(' ')); return temp.inCheck(); }
    catch { return false; }
  }

  // Returns true if a piece at this position is protected by SHIELD_WALL
  _isShielded(pieceColorChar) {
    const fullColor = pieceColorChar === 'w' ? 'white' : 'black';
    return this.activeEffects.some(e => e.cardId === 'SHIELD_WALL' && e.color === fullColor);
  }

  resign(socketId) {
    const color = this.getPlayerColor(socketId);
    if (!color) return { error: 'Not a player' };
    if (this.phase === 'gameover') return { error: 'Game already over' };
    this.isResignation = true;
    this.resignedColor = color;
    this.phase = 'gameover';
    return { ok: true };
  }

  offerDraw(socketId) {
    const color = this.getPlayerColor(socketId);
    if (!color || this.phase === 'gameover') return { error: 'Cannot offer draw' };
    if (this.drawOffer) return { error: 'Draw already offered' };
    this.drawOffer = { from: color };
    return { ok: true };
  }

  acceptDraw(socketId) {
    const color = this.getPlayerColor(socketId);
    if (!color || !this.drawOffer || this.drawOffer.from === color)
      return { error: 'No draw offer to accept' };
    this.isDraw = true;
    this.drawOffer = null;
    this.phase = 'gameover';
    return { ok: true };
  }

  declineDraw(socketId) {
    const color = this.getPlayerColor(socketId);
    if (!color || !this.drawOffer || this.drawOffer.from === color)
      return { error: 'No draw offer to decline' };
    this.drawOffer = null;
    return { ok: true };
  }

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
    this.isResignation = false;
    this.resignedColor = null;
    this.drawOffer = null;
    this.isDraw = false;
    this.lastEvent = null;
    if (this.botColor) {
      this.players['__bot__'] = this.botColor;
      this.colors[this.botColor] = '__bot__';
    }
  }

  passTurn(socketId) {
    const color = this.getPlayerColor(socketId);
    if (!color || color !== this.getCurrentTurn()) return { error: 'Not your turn' };
    if (this.skippedTurns[color] <= 0) return { error: 'Turn not frozen' };
    this.skippedTurns[color]--;
    this.lastMove = null;
    const fen = this.chess.fen();
    // Guard: if board is corrupted (king missing), end the game gracefully
    if (!fen.includes('K') || !fen.includes('k')) { this.phase = 'gameover'; return { ok: true }; }
    this.chess.load(advanceFenTurn(fen, color));
    this._afterMove(color, false); // frozen turns don't consume card effect durations
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
      const pawnRush = this.activeEffects.find(e => e.cardId === 'PAWN_RUSH');
      if (pawnRush && this._isPawnRushMove(move.from, move.to, color))
        result = this._applySpecialMove(move.from, move.to, color);
    }
    if (!result) {
      const knightsDomain = this.activeEffects.find(e => e.cardId === 'KNIGHTS_DOMAIN');
      if (knightsDomain && this._isKnightBishopMove(move.from, move.to, color))
        result = this._applySpecialMove(move.from, move.to, color);
    }
    if (!result) {
      const pacMan = this.activeEffects.find(e => e.cardId === 'PAC_MAN');
      if (pacMan && this._isPacManWrap(move.from, move.to, color))
        result = this._applySpecialMove(move.from, move.to, color);
    }
    if (!result) return { error: 'Illegal move' };

    this.lastMove = { from: move.from, to: move.to };

    if (result.captured) {
      const capturedColor = color === 'white' ? 'black' : 'white';
      this.capturedPieces[capturedColor].push(result.captured);
      const nuclear = this.activeEffects.find(e => e.cardId === 'NUCLEAR_PAWN');
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
    if (target?.type === 'k') return null;         // never capture kings via card moves
    this.chess.remove(from);
    this.chess.put(piece, to);
    const newFen = this.chess.fen();
    // Guard: pawn on promotion rank or missing king would make the FEN invalid
    if (!newFen.includes('K') || !newFen.includes('k')) {
      // Undo the move — restore original position
      this.chess.remove(to);
      this.chess.put(piece, from);
      if (target) this.chess.put(target, to);
      return null;
    }
    try {
      this.chess.load(advanceFenTurn(newFen, color));
    } catch {
      // FEN was invalid (e.g., pawn on last rank) — undo
      this.chess.remove(to);
      this.chess.put(piece, from);
      if (target) this.chess.put(target, to);
      return null;
    }
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
    if (target?.type === 'k') return null;
    return true;
  }

  _afterMove(color, countForEffects = true) {
    this.lastEvent = null;
    if (countForEffects) {
      this.activeEffects = this.activeEffects
        .map(e => ({ ...e, turnsRemaining: e.turnsRemaining - 1 }))
        .filter(e => e.turnsRemaining > 0);
      this.pendingEffects = this.pendingEffects.map(e => ({ ...e, turnsUntil: e.turnsUntil - 1 }));
      const triggered = this.pendingEffects.filter(e => e.turnsUntil <= 0);
      this.pendingEffects = this.pendingEffects.filter(e => e.turnsUntil > 0);
      for (const e of triggered) if (e.cardId === 'OMEGA_CHAD') this._triggerOmegaChad();
    }

    if (this.bonusMoves[color] > 0) {
      this.bonusMoves[color]--;
      const parts = this.chess.fen().split(' ');
      parts[1] = color === 'white' ? 'w' : 'b';
      if (color === 'black') parts[5] = String(Math.max(1, parseInt(parts[5]) - 1));
      this.chess.load(parts.join(' '));
      this._scheduleBotTurn(); // ensure bot is triggered for its bonus move
      return;
    }

    if (this.chess.turn() === 'w') this.fullMoves++;
    if (this.chess.isGameOver()) { this.phase = 'gameover'; return; }
    if (this.fullMoves > 0 && this.fullMoves % 3 === 0 && this.fullMoves !== this.lastCardDealAt) {
      this.lastCardDealAt = this.fullMoves;
      this._startCardPhase();
      this._scheduleBotTurn();
      return;
    }
    this._nextAwaitingOrPlay();
    // If Hobbit Charge is active and the next player has no legal pawn moves, auto-pass.
    // If BOTH players are stuck, expire the effect so the game can continue normally.
    if (this.phase === 'play' && this.activeEffects.some(e => e.cardId === 'HOBBIT_CHARGE')) {
      const nextColor = this.getCurrentTurn();
      const pawnMoves = this.chess.moves({ verbose: true }).filter(m => m.piece === 'p');
      // Validate FEN integrity after chess.moves() — card effects can create positions where
      // move generation temporarily corrupts _kings state; skip auto-pass if board is inconsistent
      const fenAfterMoves = this.chess.fen();
      if (!pawnMoves.length && !this.chess.isGameOver() && fenAfterMoves.includes('K') && fenAfterMoves.includes('k')) {
        // Check if the other player also has no pawn moves
        const otherFen = advanceFenTurn(fenAfterMoves, nextColor);
        const tempChess = new Chess();
        try { tempChess.load(otherFen); } catch { /* ignore */ }
        const otherPawnMoves = tempChess.moves({ verbose: true }).filter(m => m.piece === 'p');
        if (!otherPawnMoves.length) {
          // Both stuck — expire all Hobbit Charge effects immediately
          this.activeEffects = this.activeEffects.filter(e => e.cardId !== 'HOBBIT_CHARGE');
        } else {
          // Just this player is stuck — auto-pass their turn
          this.chess.load(otherFen);
          if (this.chess.turn() === 'w') this.fullMoves++;
          if (this.chess.isGameOver()) { this.phase = 'gameover'; }
          else if (this.fullMoves > 0 && this.fullMoves % 3 === 0 && this.fullMoves !== this.lastCardDealAt) {
            this.lastCardDealAt = this.fullMoves;
            this._startCardPhase();
          } else {
            this._nextAwaitingOrPlay();
          }
        }
      }
    }
    this._scheduleBotTurn();
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
        // Safety: never remove kings; respect SHIELD_WALL
        if (p && p.type !== 'k' && !this._isShielded(p.color)) this.chess.remove(sq);
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
    const destroyed = [];
    for (const { r, f } of both) {
      const sq = String.fromCharCode(97+f)+(r+1);
      const p = this.chess.get(sq);
      // Safety: never remove kings; respect SHIELD_WALL
      if (p && p.type !== 'k' && !this._isShielded(p.color)) {
        this.chess.remove(sq);
        destroyed.push(sq);
      }
    }
    this.lastEvent = { type: 'OMEGA_CHAD', destroyed };
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
    // Apply non-COPYCAT cards first so COPYCAT can reference them
    for (const color of ['white', 'black']) {
      if (selections[color] !== 'COPYCAT') this._applyCard(selections[color], color);
    }
    // Now apply COPYCAT — copies opponent's card (not another COPYCAT)
    for (const color of ['white', 'black']) {
      if (selections[color] === 'COPYCAT') {
        const opp = color === 'white' ? 'black' : 'white';
        if (selections[opp] && selections[opp] !== 'COPYCAT') this._applyCard(selections[opp], color);
      }
    }
    this._nextAwaitingOrPlay();
    this._scheduleBotTurn();
  }

  _applyCard(cardId, color) {
    const opp = color === 'white' ? 'black' : 'white';
    switch (cardId) {
      case 'DOUBLE_MOVE': this.bonusMoves[color]++; break;
      case 'TIME_FREEZE': this.skippedTurns.white++; this.skippedTurns.black++; break;
      case 'RESURRECTION':
        if (this.capturedPieces[color].length > 0) this.actionQueue.push({ type: 'resurrect', color });
        break;
      case 'SWAP_PLACES': this.actionQueue.push({ type: 'swap', color }); break;
      case 'OMEGA_CHAD': this.pendingEffects.push({ cardId, color: 'both', turnsUntil: 6 }); break;
      default: {
        // Symmetric cards affect all players; personal cards track their owner
        const SYMMETRIC = ['PAC_MAN','HOBBIT_CHARGE','KNIGHTS_DOMAIN','NUCLEAR_PAWN','PAWN_RUSH'];
        const effectColor = SYMMETRIC.includes(cardId) ? 'both' : color;
        this.activeEffects.push({ cardId, color: effectColor, turnsRemaining: CARDS[cardId].turns * 2 });
      }
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
    // Perform swap
    this.chess.remove(sq1); this.chess.remove(sq2);
    this.chess.put(p1, sq2); this.chess.put(p2, sq1);
    // Safety: reject if swap exposes own king to check
    if (this._kingInCheck(cc)) {
      this.chess.remove(sq1); this.chess.remove(sq2);
      this.chess.put(p1, sq1); this.chess.put(p2, sq2);
      return { error: 'Swap would leave your king in check' };
    }
    this._nextAwaitingOrPlay();
    this._scheduleBotTurn();
    return { ok: true };
  }

  applyResurrection(socketId, square) {
    const color = this.getPlayerColor(socketId);
    if (!this.awaitingAction || this.awaitingAction.type !== 'resurrect' || this.awaitingAction.color !== color)
      return { error: 'Not awaiting resurrection from you' };
    if (!this.capturedPieces[color].length) return { error: 'No captured pieces' };
    if (this.chess.get(square)) return { error: 'Square is occupied' };
    const cc = color === 'white' ? 'w' : 'b';
    const pieceType = this.capturedPieces[color][this.capturedPieces[color].length - 1];
    this.chess.put({ type: pieceType, color: cc }, square);
    // Safety: reject if resurrection exposes own king to check
    if (this._kingInCheck(cc)) {
      this.chess.remove(square);
      return { error: 'Placement would leave your king in check' };
    }
    this.capturedPieces[color].pop();
    this._nextAwaitingOrPlay();
    this._scheduleBotTurn();
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
      gameOver: this.chess.isGameOver() || this.phase === 'gameover',
      inCheck: this.chess.inCheck(),
      isCheckmate: this.chess.isCheckmate(),
      isStalemate: this.chess.isStalemate(),
      isResignation: this.isResignation,
      resignedColor: this.resignedColor,
      isDraw: this.isDraw,
      drawOffer: this.drawOffer,
      moveHistory: this.chess.history(),
      players: { white: !!this.colors.white, black: !!this.colors.black },
      hasBot: !!this.botColor,
      botDifficulty: this.botDifficulty,
      lastEvent: this.lastEvent,
    };
  }
}

module.exports = { GameRoom };
