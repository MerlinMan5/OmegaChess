const { Chess } = require('chess.js');
const { CARDS } = require('./cards');

const CARD_POOL = Object.values(CARDS);

function dealCards() {
  return [...CARD_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
}

// ── Evaluation helpers ────────────────────────────────────────────────────────
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

function evalBoard(board, botColorChar) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) continue;
      const pstRow = p.color === 'w' ? r : 7 - r;
      const val = (PIECE_VALUE[p.type] || 0) + (PST[p.type]?.[pstRow]?.[f] ?? 0);
      score += p.color === botColorChar ? val : -val;
    }
  }
  return score;
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
    this.isResignation = false;
    this.resignedColor = null;
    this.drawOffer = null;
    this.isDraw = false;
    this.lastEvent = null;
    this.fastMode = false;
    this.moveHistory = [];
    this.winner = null; // 'white' | 'black' | null
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
              pieces.push(String.fromCharCode(97+f)+(8-r));
        let swapped = false;
        if (pieces.length >= 2) {
          pieces.sort(() => Math.random() - 0.5);
          for (let i = 0; i < pieces.length - 1; i++) {
            if (this.applySwap('__bot__', [pieces[i], pieces[i+1]]).ok) { swapped = true; break; }
          }
        }
        if (!swapped) this._nextAwaitingOrPlay();
      } else if (type === 'resurrect') {
        const nextPiece = this.capturedPieces[color]?.[this.capturedPieces[color].length - 1];
        const empty = [];
        for (let r = 0; r < 8; r++)
          for (let f = 0; f < 8; f++) {
            if (board[r][f]) continue;
            const sq = String.fromCharCode(97+f)+(8-r);
            // Avoid promotion ranks for pawns
            if (nextPiece === 'p' && (sq[1] === '1' || sq[1] === '8')) continue;
            empty.push(sq);
          }
        let resurrected = false;
        if (empty.length) {
          const sq = empty[Math.floor(Math.random() * empty.length)];
          resurrected = this.applyResurrection('__bot__', sq).ok;
        }
        if (!resurrected) this._nextAwaitingOrPlay();
      } else {
        this._nextAwaitingOrPlay();
      }
      this.onBotAction();
      return;
    }

    if (this.phase !== 'play' || this.getCurrentTurn() !== color) return;

    if (this.skippedTurns[color] > 0) {
      if (this.passTurn('__bot__').ok) this.onBotAction();
      return;
    }

    const cc = color === 'white' ? 'w' : 'b';
    const legalMoves = this.getLegalMoves();

    if (!legalMoves.length) {
      this.phase = 'gameover';
      this.onBotAction();
      return;
    }

    let m;
    if (this.botDifficulty === 'easy') {
      m = legalMoves[Math.floor(Math.random() * legalMoves.length)];
    } else {
      m = this._pickBotMove(legalMoves, cc, this.botDifficulty === 'hard');
    }

    const move = { from: m.from, to: m.to };
    if (m.promotion) move.promotion = m.promotion;
    else if (m.piece === 'p') {
      const toRank = parseInt(m.to[1]);
      if ((cc === 'w' && toRank === 8) || (cc === 'b' && toRank === 1)) move.promotion = 'q';
    }

    const result = this.applyMove('__bot__', move);
    if (result.ok) {
      this.onBotAction();
    } else {
      // Fallback: try any move
      for (const fm of legalMoves) {
        const fa = { from: fm.from, to: fm.to };
        if (fm.promotion) fa.promotion = fm.promotion;
        if (this.applyMove('__bot__', fa).ok) break;
      }
      this.onBotAction();
    }
  }

  // Greedy bot: depth-1 for medium, depth-2 for hard
  _pickBotMove(legalMoves, colorChar, deep = false) {
    // King capture is an instant win — always take it
    const kingCapture = legalMoves.find(m => m.captured === 'k');
    if (kingCapture) return kingCapture;

    const savedFen = this.chess.fen();
    const oppColorChar = colorChar === 'w' ? 'b' : 'w';
    let bestScore = -Infinity;
    let best = [];

    for (const m of legalMoves) {
      let score = 0;
      const applied = this._applyMoveForEval(m, colorChar);
      if (applied) {
        if (deep) {
          const afterFen = this.chess.fen();
          const oppMoves = this._generateMoves(oppColorChar);
          if (oppMoves.some(om => om.captured === 'k')) {
            score = -900_000;
          } else {
            let oppBest = -Infinity;
            for (const om of oppMoves.slice(0, 15)) {
              const oppApplied = this._applyMoveForEval(om, oppColorChar);
              if (oppApplied) {
                const s = evalBoard(this.chess.board(), colorChar);
                if (s > oppBest) oppBest = s;
              }
              let restored = false;
              try { this.chess.load(afterFen); restored = true; } catch { /* ignore */ }
              if (!restored) break; // stop inner eval if restore fails — outer loop will restore savedFen
            }
            score = evalBoard(this.chess.board(), colorChar) - (oppBest !== -Infinity ? oppBest * 0.4 : 0);
          }
        } else {
          score = evalBoard(this.chess.board(), colorChar);
        }
      } else {
        score = (PIECE_VALUE[m.captured] || 0);
      }
      // Always restore position after eval (even on failure, to fix corrupted board state)
      try { this.chess.load(savedFen); } catch { /* ignore */ }
      score += (Math.random() - 0.5) * 10;
      if (score > bestScore) { bestScore = score; best = [m]; }
      else if (score === bestScore) best.push(m);
    }

    return best[Math.floor(Math.random() * best.length)] || legalMoves[0];
  }

  // Apply a move from _generateMoves for evaluation purposes, returns true if applied
  _applyMoveForEval(m, colorChar) {
    try {
      const r = this.chess.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' });
      if (r) return true;
    } catch { /* fall through */ }
    const r = this._applyAnyMove(m.from, m.to, colorChar, m.promotion);
    return !!r;
  }

  isFull() { return Object.keys(this.players).length >= 2; }
  isEmpty() { return Object.keys(this.players).length === 0; }
  getPlayerColor(socketId) { return this.players[socketId]; }
  getCurrentTurn() { return this.chess.turn() === 'w' ? 'white' : 'black'; }

  // Generate all pseudo-legal moves for colorChar without any check validation.
  // In capture-the-king mode, there is no check enforcement — opponents simply capture the king.
  _generateMoves(colorChar) {
    const board = this.chess.board();
    const fen = this.chess.fen();
    const fenParts = fen.split(' ');
    const epSquare = fenParts[3]; // '-' or e.g. 'e3'
    const castling = fenParts[2]; // castling rights

    const oppColor = colorChar === 'w' ? 'b' : 'w';
    const moves = [];
    const sq = (row, col) => String.fromCharCode(97 + col) + (8 - row);
    const get = (row, col) => (row >= 0 && row < 8 && col >= 0 && col < 8) ? board[row][col] : null;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        if (!piece || piece.color !== colorChar) continue;
        const fromSq = sq(row, col);

        if (piece.type === 'p') {
          const dir = colorChar === 'w' ? -1 : 1;
          const startRow = colorChar === 'w' ? 6 : 1;
          const promoRow = colorChar === 'w' ? 0 : 7;

          const nr = row + dir;
          if (nr >= 0 && nr <= 7 && !get(nr, col)) {
            const toSq = sq(nr, col);
            if (nr === promoRow) {
              for (const p of ['q', 'r', 'b', 'n'])
                moves.push({ from: fromSq, to: toSq, piece: 'p', captured: null, promotion: p, flags: 'p' });
            } else {
              moves.push({ from: fromSq, to: toSq, piece: 'p', captured: null, promotion: null, flags: 'n' });
              if (row === startRow && !get(nr + dir, col))
                moves.push({ from: fromSq, to: sq(nr + dir, col), piece: 'p', captured: null, promotion: null, flags: 'b' });
            }
          }

          for (const dc of [-1, 1]) {
            const cnr = row + dir, cnc = col + dc;
            if (cnr < 0 || cnr > 7 || cnc < 0 || cnc > 7) continue;
            const target = get(cnr, cnc);
            const toSq = sq(cnr, cnc);
            if (target && target.color === oppColor) {
              if (cnr === promoRow) {
                for (const p of ['q', 'r', 'b', 'n'])
                  moves.push({ from: fromSq, to: toSq, piece: 'p', captured: target.type, promotion: p, flags: 'cp' });
              } else {
                moves.push({ from: fromSq, to: toSq, piece: 'p', captured: target.type, promotion: null, flags: 'c' });
              }
            }
            if (toSq === epSquare && !target)
              moves.push({ from: fromSq, to: toSq, piece: 'p', captured: 'p', promotion: null, flags: 'e' });
          }

        } else if (piece.type === 'n') {
          for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
            const nr = row + dr, nc = col + dc;
            if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
            const target = get(nr, nc);
            if (!target || target.color !== colorChar)
              moves.push({ from: fromSq, to: sq(nr, nc), piece: 'n', captured: target?.type || null, promotion: null, flags: target ? 'c' : 'n' });
          }

        } else if (piece.type === 'b' || piece.type === 'r' || piece.type === 'q') {
          const rays = piece.type === 'b' ? [[-1,-1],[-1,1],[1,-1],[1,1]] :
                       piece.type === 'r' ? [[-1,0],[1,0],[0,-1],[0,1]] :
                       [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
          for (const [dr, dc] of rays) {
            let nr = row + dr, nc = col + dc;
            while (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
              const target = get(nr, nc);
              if (!target) {
                moves.push({ from: fromSq, to: sq(nr, nc), piece: piece.type, captured: null, promotion: null, flags: 'n' });
              } else {
                if (target.color !== colorChar)
                  moves.push({ from: fromSq, to: sq(nr, nc), piece: piece.type, captured: target.type, promotion: null, flags: 'c' });
                break;
              }
              nr += dr; nc += dc;
            }
          }

        } else if (piece.type === 'k') {
          for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
            const nr = row + dr, nc = col + dc;
            if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
            const target = get(nr, nc);
            if (!target || target.color !== colorChar)
              moves.push({ from: fromSq, to: sq(nr, nc), piece: 'k', captured: target?.type || null, promotion: null, flags: target ? 'c' : 'n' });
          }

          // Castling — no check validation in CTK mode
          if (colorChar === 'w' && row === 7 && col === 4) {
            if (castling.includes('K') && !get(7,5) && !get(7,6) && get(7,7)?.type === 'r' && get(7,7)?.color === 'w')
              moves.push({ from: fromSq, to: 'g1', piece: 'k', captured: null, promotion: null, flags: 'k' });
            if (castling.includes('Q') && !get(7,3) && !get(7,2) && !get(7,1) && get(7,0)?.type === 'r' && get(7,0)?.color === 'w')
              moves.push({ from: fromSq, to: 'c1', piece: 'k', captured: null, promotion: null, flags: 'q' });
          } else if (colorChar === 'b' && row === 0 && col === 4) {
            if (castling.includes('k') && !get(0,5) && !get(0,6) && get(0,7)?.type === 'r' && get(0,7)?.color === 'b')
              moves.push({ from: fromSq, to: 'g8', piece: 'k', captured: null, promotion: null, flags: 'k' });
            if (castling.includes('q') && !get(0,3) && !get(0,2) && !get(0,1) && get(0,0)?.type === 'r' && get(0,0)?.color === 'b')
              moves.push({ from: fromSq, to: 'c8', piece: 'k', captured: null, promotion: null, flags: 'q' });
          }
        }
      }
    }

    return moves;
  }

  // Apply a move directly, bypassing chess.js check enforcement.
  // Handles en passant, castling, promotion, and FEN update.
  _applyAnyMove(from, to, colorChar, promotion) {
    const piece = this.chess.get(from);
    if (!piece || piece.color !== colorChar) return null;

    const fen = this.chess.fen();
    const fenParts = fen.split(' ');
    const epSquare = fenParts[3];
    const castling = fenParts[2];
    const halfmove = parseInt(fenParts[4]) || 0;
    const fullmove = parseInt(fenParts[5]) || 1;

    const target = this.chess.get(to);
    let captured = target?.type || null;

    // En passant capture
    if (piece.type === 'p' && to === epSquare && !target) {
      const epRank = colorChar === 'w' ? parseInt(to[1]) - 1 : parseInt(to[1]) + 1;
      const epCapSq = to[0] + epRank;
      const epPawn = this.chess.get(epCapSq);
      captured = epPawn?.type || null;
      this.chess.remove(epCapSq);
    }

    // Castling: move the rook too
    if (piece.type === 'k') {
      const fromFile = from.charCodeAt(0) - 97;
      const toFile = to.charCodeAt(0) - 97;
      if (Math.abs(toFile - fromFile) === 2) {
        if (toFile === 6) {
          const rFrom = colorChar === 'w' ? 'h1' : 'h8';
          const rTo = colorChar === 'w' ? 'f1' : 'f8';
          const rook = this.chess.get(rFrom);
          if (rook) { this.chess.remove(rFrom); this.chess.put(rook, rTo); }
        } else if (toFile === 2) {
          const rFrom = colorChar === 'w' ? 'a1' : 'a8';
          const rTo = colorChar === 'w' ? 'd1' : 'd8';
          const rook = this.chess.get(rFrom);
          if (rook) { this.chess.remove(rFrom); this.chess.put(rook, rTo); }
        }
      }
    }

    this.chess.remove(from);
    // Auto-promote if pawn reaches promo rank without explicit promotion (avoids invalid FEN)
    let promo = promotion;
    if (piece.type === 'p' && !promo) {
      const rank = to[1];
      if ((colorChar === 'w' && rank === '8') || (colorChar === 'b' && rank === '1')) promo = 'q';
    }
    const finalPiece = (piece.type === 'p' && promo) ? { type: promo, color: colorChar } : piece;
    this.chess.put(finalPiece, to);

    // Update castling rights
    let newCastling = castling;
    if (piece.type === 'k') newCastling = newCastling.replace(colorChar === 'w' ? /[KQ]/g : /[kq]/g, '');
    if (from === 'h1' || to === 'h1') newCastling = newCastling.replace('K', '');
    if (from === 'a1' || to === 'a1') newCastling = newCastling.replace('Q', '');
    if (from === 'h8' || to === 'h8') newCastling = newCastling.replace('k', '');
    if (from === 'a8' || to === 'a8') newCastling = newCastling.replace('q', '');
    if (!newCastling) newCastling = '-';

    // En passant square: only valid for standard double pawn push from starting rank
    // (PAWN_RUSH pushes from non-starting ranks would create invalid EP squares)
    let newEp = '-';
    if (piece.type === 'p') {
      const fromRank = parseInt(from[1]);
      const toRank = parseInt(to[1]);
      const startingRank = colorChar === 'w' ? 2 : 7;
      if (fromRank === startingRank && Math.abs(toRank - fromRank) === 2) {
        const epRank = colorChar === 'w' ? fromRank + 1 : fromRank - 1;
        newEp = from[0] + epRank;
      }
    }

    const newHalfmove = (piece.type === 'p' || captured) ? 0 : halfmove + 1;
    const newFullmove = colorChar === 'w' ? fullmove : fullmove + 1;
    const nextTurn = colorChar === 'w' ? 'b' : 'w';

    const boardFen = this.chess.fen().split(' ')[0];
    const newFen = `${boardFen} ${nextTurn} ${newCastling} ${newEp} ${newHalfmove} ${newFullmove}`;
    // King captures leave the board without a king — skip FEN load since game ends immediately
    if (captured !== 'k') {
      try { this.chess.load(newFen); } catch { return null; }
    }

    const pMap = { p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };
    const notation = `${pMap[piece.type]}${from}${captured ? 'x' : '-'}${to}${promotion ? '='+promotion.toUpperCase() : ''}`;
    return { piece: piece.type, captured, from, to, promotion: promotion || null, san: notation };
  }

  // Returns true if colorChar's king is attacked by any opponent piece
  _isKingAttacked(colorChar) {
    const board = this.chess.board();
    let kingSq = null;
    for (let r = 0; r < 8 && !kingSq; r++)
      for (let c = 0; c < 8 && !kingSq; c++)
        if (board[r][c]?.type === 'k' && board[r][c]?.color === colorChar)
          kingSq = String.fromCharCode(97 + c) + (8 - r);
    if (!kingSq) return false;
    const oppColorChar = colorChar === 'w' ? 'b' : 'w';
    return this._generateMoves(oppColorChar).some(m => m.to === kingSq);
  }

  // Returns legal moves for the current position, accounting for active card effects.
  // No check validation — capture-the-king mode.
  getLegalMoves() {
    const color = this.getCurrentTurn();
    const colorChar = color === 'white' ? 'w' : 'b';
    let moves = this._generateMoves(colorChar);

    const hobbit = this.activeEffects.some(e => e.cardId === 'HOBBIT_CHARGE');
    if (hobbit) moves = moves.filter(m => m.piece === 'p');

    const board = this.chess.board();
    const sq = (row, col) => String.fromCharCode(97 + col) + (8 - row);

    // KNIGHTS_DOMAIN: knights also slide diagonally like bishops
    if (this.activeEffects.some(e => e.cardId === 'KNIGHTS_DOMAIN') && !hobbit) {
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const p = board[row][col];
          if (!p || p.type !== 'n' || p.color !== colorChar) continue;
          const from = sq(row, col);
          for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
            let nr = row + dr, nc = col + dc;
            while (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
              const target = board[nr][nc];
              const to = sq(nr, nc);
              if (!target) {
                if (!moves.some(m => m.from === from && m.to === to))
                  moves.push({ from, to, piece: 'n', captured: null, promotion: null, flags: 'n' });
              } else {
                if (target.color !== colorChar && !moves.some(m => m.from === from && m.to === to))
                  moves.push({ from, to, piece: 'n', captured: target.type, promotion: null, flags: 'c' });
                break;
              }
              nr += dr; nc += dc;
            }
          }
        }
      }
    }

    // PAWN_RUSH: non-starting-rank pawns can advance 2 squares
    if (this.activeEffects.some(e => e.cardId === 'PAWN_RUSH') && !hobbit) {
      const dir = color === 'white' ? -1 : 1;
      const startRow = color === 'white' ? 6 : 1;
      const promoRow = color === 'white' ? 0 : 7;
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const p = board[row][col];
          if (!p || p.type !== 'p' || p.color !== colorChar) continue;
          if (row === startRow) continue;
          const midRow = row + dir, targetRow = row + dir * 2;
          if (targetRow < 0 || targetRow > 7 || targetRow === promoRow) continue;
          if (board[midRow]?.[col] || board[targetRow]?.[col]) continue;
          const from = sq(row, col), to = sq(targetRow, col);
          if (!moves.some(m => m.from === from && m.to === to))
            moves.push({ from, to, piece: 'p', captured: null, promotion: null, flags: 'b' });
        }
      }
    }

    // PAC_MAN: rooks and queens on edges wrap to opposite edge
    if (this.activeEffects.some(e => e.cardId === 'PAC_MAN')) {
      for (let row = 0; row < 8; row++) {
        for (const col of [0, 7]) {
          const p = board[row][col];
          if (!p || !['r','q'].includes(p.type) || p.color !== colorChar) continue;
          const oppCol = col === 0 ? 7 : 0;
          const target = board[row][oppCol];
          if (target?.color === colorChar) continue;
          if (target?.type === 'k') continue;
          const from = sq(row, col), to = sq(row, oppCol);
          if (!moves.some(m => m.from === from && m.to === to))
            moves.push({ from, to, piece: p.type, captured: target?.type || null, promotion: null, flags: target ? 'c' : 'n' });
        }
      }
    }

    return moves;
  }

  resign(socketId) {
    const color = this.getPlayerColor(socketId);
    if (!color) return { error: 'Not a player' };
    if (this.phase === 'gameover') return { error: 'Game already over' };
    this.isResignation = true;
    this.resignedColor = color;
    this.winner = color === 'white' ? 'black' : 'white';
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
    this.moveHistory = [];
    this.winner = null;
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
    if (!fen.includes('K') || !fen.includes('k')) { this.phase = 'gameover'; return { ok: true }; }
    this.chess.load(advanceFenTurn(fen, color));
    this._afterMove(color, false);
    return { ok: true };
  }

  applyMove(socketId, move) {
    if (this.phase !== 'play') return { error: 'Not in play phase' };
    const color = this.getPlayerColor(socketId);
    if (!color) return { error: 'Not a player' };
    if (color !== this.getCurrentTurn()) return { error: 'Not your turn' };
    if (this.skippedTurns[color] > 0) return { error: 'Your turn is frozen — use Pass Turn' };

    const colorChar = color === 'white' ? 'w' : 'b';

    const hobbit = this.activeEffects.find(e => e.cardId === 'HOBBIT_CHARGE');
    if (hobbit) {
      const piece = this.chess.get(move.from);
      if (!piece || piece.type !== 'p') return { error: 'Hobbit Charge: only pawns can move' };
    }

    // Validate against server-generated legal moves
    const legal = this.getLegalMoves();
    const isLegal = legal.some(m =>
      m.from === move.from && m.to === move.to &&
      (!m.promotion || !move.promotion || m.promotion === move.promotion)
    );
    if (!isLegal) return { error: 'Illegal move' };

    // Try chess.js first (handles standard moves with proper state updates)
    let result = null;
    try {
      result = this.chess.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
    } catch { /* fall through */ }

    // If chess.js rejected (move walks into check — allowed in CTK mode), apply manually
    if (!result) {
      result = this._applyAnyMove(move.from, move.to, colorChar, move.promotion);
    }

    if (!result) return { error: 'Move application failed' };

    this.lastMove = { from: move.from, to: move.to };

    const pMap = { p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };
    const cap = result.captured ? 'x' : '-';
    this.moveHistory.push(result.san || `${pMap[result.piece] ?? ''}${move.from}${cap}${move.to}`);

    // Win condition: king captured
    if (result.captured === 'k') {
      this.winner = color;
      this.phase = 'gameover';
      this.lastEvent = { type: 'KING_CAPTURED', by: color };
      return { ok: true };
    }

    if (result.captured) {
      const capturedColor = color === 'white' ? 'black' : 'white';
      this.capturedPieces[capturedColor].push(result.captured);
      const nuclear = this.activeEffects.find(e => e.cardId === 'NUCLEAR_PAWN');
      if (nuclear && result.piece === 'p') this._nukeAdjacent(move.to);
    }

    this._afterMove(color);
    return { ok: true };
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

    if (this.phase === 'gameover') return;

    if (this.bonusMoves[color] > 0) {
      this.bonusMoves[color]--;
      const fenB = this.chess.fen();
      if (!fenB.includes('K') || !fenB.includes('k')) { this.phase = 'gameover'; return; }
      const parts = fenB.split(' ');
      parts[1] = color === 'white' ? 'w' : 'b';
      if (color === 'black') parts[5] = String(Math.max(1, parseInt(parts[5]) - 1));
      try { this.chess.load(parts.join(' ')); } catch { /* ignore */ }
      this._scheduleBotTurn();
      return;
    }

    if (this.chess.turn() === 'w') this.fullMoves++;

    if (this.fullMoves > 0 && this.fullMoves % 3 === 0 && this.fullMoves !== this.lastCardDealAt) {
      this.lastCardDealAt = this.fullMoves;
      this._startCardPhase();
      this._scheduleBotTurn();
      return;
    }

    this._nextAwaitingOrPlay();

    // HOBBIT_CHARGE: if next player has no pawn moves, auto-pass their turn
    if (this.phase === 'play' && this.activeEffects.some(e => e.cardId === 'HOBBIT_CHARGE')) {
      const nextColor = this.getCurrentTurn();
      const nextColorChar = nextColor === 'white' ? 'w' : 'b';
      const pawnMoves = this._generateMoves(nextColorChar).filter(m => m.piece === 'p');
      if (!pawnMoves.length) {
        // Check if opponent also has no pawn moves
        const currFen = this.chess.fen();
        const oppColorChar = nextColorChar === 'w' ? 'b' : 'w';
        const parts = currFen.split(' ');
        parts[1] = oppColorChar;
        const tempChess = new Chess();
        let oppHasPawnMoves = false;
        try {
          tempChess.load(parts.join(' '));
          const tempBoard = tempChess.board();
          const dir = oppColorChar === 'w' ? -1 : 1;
          outer: for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
              const p = tempBoard[r][c];
              if (!p || p.color !== oppColorChar || p.type !== 'p') continue;
              const nr = r + dir;
              if (nr >= 0 && nr <= 7 && !tempBoard[nr][c]) { oppHasPawnMoves = true; break outer; }
              for (const dc of [-1, 1]) {
                const nc = c + dc;
                if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7 && tempBoard[nr][nc]?.color === (oppColorChar === 'w' ? 'b' : 'w'))
                  { oppHasPawnMoves = true; break outer; }
              }
            }
          }
        } catch { /* ignore */ }

        if (!oppHasPawnMoves) {
          this.activeEffects = this.activeEffects.filter(e => e.cardId !== 'HOBBIT_CHARGE');
        } else {
          const newFen = advanceFenTurn(this.chess.fen(), nextColor);
          try { this.chess.load(newFen); } catch { /* ignore */ }
          if (this.chess.turn() === 'w') this.fullMoves++;
          if (this.fullMoves > 0 && this.fullMoves % 3 === 0 && this.fullMoves !== this.lastCardDealAt) {
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
    // Destroy pieces adjacent to EITHER king (union)
    const squaresToCheck = new Set();
    for (const king of [kings.w, kings.b])
      for (const { r, f } of adjacent(king))
        squaresToCheck.add(String.fromCharCode(97+f)+(r+1));
    const destroyed = [];
    for (const sq of squaresToCheck) {
      const p = this.chess.get(sq);
      if (p && p.type !== 'k' && !this._isShielded(p.color)) {
        this.chess.remove(sq);
        destroyed.push(sq);
      }
    }
    this.lastEvent = { type: 'OMEGA_CHAD', destroyed };
  }

  _isShielded(pieceColorChar) {
    const fullColor = pieceColorChar === 'w' ? 'white' : 'black';
    return this.activeEffects.some(e => e.cardId === 'SHIELD_WALL' && e.color === fullColor);
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
    for (const color of ['white', 'black']) {
      if (selections[color] !== 'COPYCAT') this._applyCard(selections[color], color);
    }
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
      case 'DOUBLE_MOVE': this.bonusMoves[color]++; this.bonusMoves[opp]++; break;
      case 'TIME_FREEZE': this.skippedTurns[opp]++; break;
      case 'RESURRECTION':
        if (this.capturedPieces[color].length > 0) this.actionQueue.push({ type: 'resurrect', color });
        break;
      case 'SWAP_PLACES': this.actionQueue.push({ type: 'swap', color }); break;
      case 'OMEGA_CHAD': this.pendingEffects.push({ cardId, color: 'both', turnsUntil: 6 }); break;
      default: {
        const SYMMETRIC = ['PAC_MAN','HOBBIT_CHARGE','KNIGHTS_DOMAIN','NUCLEAR_PAWN','PAWN_RUSH'];
        const effectColor = SYMMETRIC.includes(cardId) ? 'both' : color;
        this.activeEffects.push({ cardId, color: effectColor, turnsRemaining: CARDS[cardId].turns * 2 });
      }
    }
  }

  _isActionPossible(action) {
    const cc = action.color === 'white' ? 'w' : 'b';
    if (action.type === 'resurrect') {
      if (!this.capturedPieces[action.color].length) return false;
      const nextPiece = this.capturedPieces[action.color][this.capturedPieces[action.color].length - 1];
      const board = this.chess.board();
      for (let r = 0; r < 8; r++)
        for (let f = 0; f < 8; f++) {
          if (board[r][f]) continue;
          const rank = 8 - r;
          if (nextPiece === 'p' && (rank === 1 || rank === 8)) continue;
          return true;
        }
      return false;
    }
    if (action.type === 'swap') {
      let count = 0;
      const board = this.chess.board();
      for (let r = 0; r < 8; r++)
        for (let f = 0; f < 8; f++)
          if (board[r][f]?.color === cc && board[r][f]?.type !== 'k') count++;
      return count >= 2;
    }
    return true;
  }

  _nextAwaitingOrPlay() {
    while (this.actionQueue.length > 0) {
      const action = this.actionQueue.shift();
      if (this._isActionPossible(action)) {
        this.awaitingAction = action;
        this.phase = 'awaiting-action';
        return;
      }
    }
    this.awaitingAction = null;
    this.phase = 'play';
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
    // Prevent pawns from landing on promotion ranks (would create invalid FEN)
    if (p1.type === 'p' && (sq2[1] === '1' || sq2[1] === '8')) return { error: 'Pawns cannot be swapped to promotion ranks' };
    if (p2.type === 'p' && (sq1[1] === '1' || sq1[1] === '8')) return { error: 'Pawns cannot be swapped to promotion ranks' };
    this.chess.remove(sq1); this.chess.remove(sq2);
    this.chess.put(p1, sq2); this.chess.put(p2, sq1);
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
    // Pawns cannot be placed on promotion ranks (would create invalid FEN)
    if (pieceType === 'p') {
      const rank = square[1];
      if (rank === '1' || rank === '8') return { error: 'Pawns cannot be placed on promotion ranks' };
    }
    this.chess.put({ type: pieceType, color: cc }, square);
    this.capturedPieces[color].pop();
    this._nextAwaitingOrPlay();
    this._scheduleBotTurn();
    return { ok: true };
  }

  getState() {
    const turn = this.getCurrentTurn();
    const turnColorChar = turn === 'white' ? 'w' : 'b';
    return {
      fen: this.chess.fen(),
      turn,
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
      gameOver: this.phase === 'gameover',
      winner: this.winner,
      inCheck: this._isKingAttacked(turnColorChar),
      isResignation: this.isResignation,
      resignedColor: this.resignedColor,
      isDraw: this.isDraw,
      drawOffer: this.drawOffer,
      moveHistory: this.moveHistory,
      legalMoves: this.phase === 'play' ? this.getLegalMoves() : [],
      players: { white: !!this.colors.white, black: !!this.colors.black },
      hasBot: !!this.botColor,
      botDifficulty: this.botDifficulty,
      lastEvent: this.lastEvent,
    };
  }
}

module.exports = { GameRoom };
