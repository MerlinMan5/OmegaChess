// Headless bot-vs-bot autoplay test.
// Plays N games in-process (no network) and reports anomalies + summary.
// Usage: node tests/autoplay.cjs [numGames=5] [difficulty=medium]
'use strict';

const { GameRoom } = require('../server/game');

const NUM_GAMES = parseInt(process.argv[2] ?? '5');
const DIFFICULTY = process.argv[3] ?? 'medium';
const MAX_TURNS = 150; // white's moves only; bot can also make ~150 = ~300 total half-moves

const stats = { games: 0, white: 0, black: 0, draw: 0, timeout: 0 };
const anomalies = [];

function log(g, msg)  { console.log(`  [G${g}] ${msg}`); }
function flag(g, msg) { console.warn(`  ⚠ [G${g}] ${msg}`); anomalies.push(`G${g}: ${msg}`); }

function playGame(gameNum) {
  const room = new GameRoom(`AUTO${gameNum}`);
  room.fastMode = true;
  room.addPlayer('p1', 'white');
  room.addBot('black', DIFFICULTY);

  // Override bot scheduling to be synchronous for reliable test execution
  let botBusy = false;
  room._scheduleBotTurn = () => {
    if (botBusy) return;
    const needsCard = room.phase === 'card-selection' && room.cardPhase && !room.cardPhase.selections[room.botColor];
    const needsAction = room.phase === 'awaiting-action' && room.awaitingAction?.color === room.botColor;
    const needsMove = room.phase === 'play' && room.getCurrentTurn() === room.botColor;
    if (!needsCard && !needsAction && !needsMove) return;
    botBusy = true;
    setImmediate(() => { botBusy = false; room._doBotTurn(); });
  };

  let turnCount = 0;
  let lastPhase = null;

  // Loop: handle all white inputs until it's the bot's turn (or game over)
  function doWhiteTurns() {
    for (let safety = 0; safety < 20; safety++) { // max 20 consecutive white actions
      const state = room.getState();

      // Log Omega Chad
      if (state.lastEvent?.type === 'OMEGA_CHAD') {
        const d = state.lastEvent.destroyed;
        log(gameNum, `💀 Omega Chad! Destroyed: [${d.join(', ') || 'none — kings not adjacent'}]`);
      }

      // Log card phase transitions
      if (state.phase !== lastPhase) {
        if (state.phase === 'play' && lastPhase === 'card-selection') {
          const eff = state.activeEffects.map(e => `${e.cardId}(${e.color})`).join(', ') || 'none';
          const pend = state.pendingEffects.map(e => `${e.cardId}@${e.turnsUntil}t`).join(', ') || 'none';
          log(gameNum, `Cards → active: ${eff}  pending: ${pend}`);
        }
        lastPhase = state.phase;
      }

      if (state.gameOver || state.phase === 'gameover') return;

      // Card selection — if white hasn't picked yet
      if (state.phase === 'card-selection') {
        if (state.cardPhase?.hands?.white && !state.cardPhase.selections?.white) {
          const hand = state.cardPhase.hands.white;
          const safe = hand.filter(c => !['RESURRECTION','SWAP_PLACES'].includes(c.id));
          const pick = (safe.length ? safe : hand)[Math.floor(Math.random() * (safe.length || hand.length))];
          const r = room.selectCard('p1', pick.id);
          if (!r.ok) { flag(gameNum, `Card select failed: ${r.error}`); return; }
          // After selecting, bot might not have picked yet — stop and wait for onBotAction
          if (room.phase === 'card-selection') return;
          continue; // card phase resolved synchronously, check next state
        }
        return; // waiting for bot to select
      }

      // Awaiting white action (SWAP, RESURRECT)
      if (state.phase === 'awaiting-action' && state.awaitingAction?.color === 'white') {
        const { type } = state.awaitingAction;
        if (type === 'resurrect') {
          const board = room.chess.board();
          const empty = [];
          for (let r2 = 0; r2 < 8; r2++)
            for (let f2 = 0; f2 < 8; f2++)
              if (!board[r2][f2]) empty.push(String.fromCharCode(97+f2)+(8-r2));
          // Shuffle and try until one succeeds (promotion-rank squares are rejected for pawns)
          empty.sort(() => Math.random() - 0.5);
          let resurrected = false;
          for (const sq of empty) {
            if (room.applyResurrection('p1', sq).ok) { resurrected = true; break; }
          }
          if (!resurrected) return; // no valid square, skip action
        } else if (type === 'swap') {
          const board = room.chess.board();
          const pieces = [];
          for (let r2 = 0; r2 < 8; r2++)
            for (let f2 = 0; f2 < 8; f2++) {
              const p = board[r2][f2];
              if (p?.color === 'w' && p.type !== 'k') pieces.push(String.fromCharCode(97+f2)+(8-r2));
            }
          if (pieces.length >= 2) {
            // Shuffle and try pairs until one works (some pairs may violate swap rules)
            pieces.sort(() => Math.random() - 0.5);
            let swapped = false;
            for (let i = 0; i < pieces.length - 1 && !swapped; i++) {
              if (room.applySwap('p1', [pieces[i], pieces[i+1]]).ok) swapped = true;
            }
            if (!swapped) { flag(gameNum, 'Swap failed: no valid pair found'); return; }
          } else return;
        }
        continue; // action handled, re-check state
      }

      // Not white's turn to move
      if (state.phase !== 'play' || state.turn !== 'white') return;

      // Frozen turn
      if ((state.skippedTurns?.white ?? 0) > 0) {
        const r = room.passTurn('p1');
        if (!r.ok) { flag(gameNum, `passTurn failed: ${r.error}`); return; }
        return; // pass surrenders the turn; bot goes next
      }

      // Regular move
      const moves = room.getLegalMoves();
      if (!moves.length) {
        if (state.gameOver || room.chess.isGameOver()) return;
        // Card restriction left white with no moves — force advance the turn
        const fen = room.chess.fen();
        if (!fen.includes('K') || !fen.includes('k')) {
          flag(gameNum, 'Board corrupted (missing king) — ending game');
          room.phase = 'gameover';
          return;
        }
        const fp = fen.split(' ');
        fp[1] = 'b'; room.chess.load(fp.join(' '));
        room._scheduleBotTurn();
        return;
      }
      const m = moves[Math.floor(Math.random() * moves.length)];
      const r = room.applyMove('p1', { from: m.from, to: m.to, ...(m.promotion ? { promotion: 'q' } : {}) });
      if (!r.ok) { flag(gameNum, `White move failed: ${r.error} (${m.from}→${m.to})`); return; }
      turnCount++;
      if (turnCount % 20 === 0) log(gameNum, `Move ${turnCount * 2} (white ${turnCount})`);
      if (turnCount > MAX_TURNS) {
        log(gameNum, `Draw by move limit at move ${turnCount * 2}`);
        room.phase = 'gameover';
      }
      // If white has a bonus move (DOUBLE_MOVE), continue the loop for the bonus
      if (room.phase === 'play' && room.getCurrentTurn() === 'white') continue;
      return; // move made — wait for bot's onBotAction
    }
    flag(gameNum, 'Too many consecutive white actions — possible loop');
  }

  return new Promise((resolve) => {
    room.onBotAction = () => {
      const s = room.getState();
      if (s.gameOver || s.phase === 'gameover') {
        stats.games++;
        if (s.lastEvent?.type === 'KING_CAPTURED' || s.winner) {
          const winner = s.winner;
          log(gameNum, `👑 King captured — ${winner} wins (move ${s.fullMoves})`);
          if (winner === 'white') stats.white++; else stats.black++;
        } else if (s.isResignation) {
          const winner = s.resignedColor === 'white' ? 'black' : 'white';
          log(gameNum, `Resigned — ${winner} wins`);
          if (winner === 'white') stats.white++; else stats.black++;
        } else if (s.isDraw) {
          log(gameNum, `Draw (move ${s.fullMoves})`);
          stats.draw++;
        } else {
          log(gameNum, `Game over (move ${s.fullMoves})`);
          stats.draw++;
        }
        resolve();
        return;
      }
      doWhiteTurns();
    };

    setTimeout(() => {
      if (room.phase !== 'gameover') {
        flag(gameNum, 'Timed out waiting for bot (possible infinite loop)');
        stats.timeout++;
        resolve();
      }
    }, 30000);

    doWhiteTurns();
  });
}

(async () => {
  console.log(`\nAutoplay: ${NUM_GAMES} game(s) @ ${DIFFICULTY}\n`);
  for (let i = 1; i <= NUM_GAMES; i++) {
    console.log(`Game ${i}:`);
    await playGame(i);
  }

  console.log('\n── Summary ──────────────────────────────────');
  console.log(`Games: ${stats.games}  White: ${stats.white}  Black: ${stats.black}  Draw: ${stats.draw}  Timeout: ${stats.timeout}`);
  if (anomalies.length === 0) {
    console.log('No anomalies detected. ✓');
  } else {
    console.log(`\nAnomalies (${anomalies.length}):`);
    anomalies.forEach(a => console.warn(`  ⚠ ${a}`));
  }
  console.log();
  process.exit(anomalies.length > 0 ? 1 : 0);
})();
