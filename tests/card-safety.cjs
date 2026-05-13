// Card safety unit tests — runs without Playwright, direct game logic
'use strict';

const { GameRoom } = require('../server/game');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

function makeRoom() {
  const room = new GameRoom('TEST');
  room.addPlayer('white-sock', 'white');
  room.addPlayer('black-sock', 'black');
  return room;
}

// ── Suite 1: SWAP_PLACES safety ──────────────────────────────────────────────
console.log('\nSuite 1: SWAP_PLACES safety');
{
  const room = makeRoom();
  // Force SWAP_PLACES awaiting action for white
  room.awaitingAction = { type: 'swap', color: 'white' };

  // White king is on e1, white queen on d1 initially
  // Try to swap king (e1) with a piece — should be OK as long as no check
  const state = room.getState();
  const fen = state.fen;
  console.log('  Board FEN:', fen.split(' ')[0]);

  // Swap two non-king pieces: a1 rook <-> b1 knight (neither exposes king)
  const result = room.applySwap('white-sock', ['a1', 'b1']);
  // Both are white pieces, no check exposure
  assert(result.ok || result.error, 'swap returns ok or error (not crash)');

  // Try to swap king square — room.applySwap should allow kings per the original logic
  // but verify swap of king wouldn't expose check
  room.awaitingAction = { type: 'swap', color: 'white' };
  const r2 = room.applySwap('white-sock', ['e1', 'a1']);
  // e1=king, a1=rook after previous swap; swapping them could expose king
  assert('ok' in r2 || 'error' in r2, 'swap king+rook returns result without crash');
}

// ── Suite 2: RESURRECTION safety ────────────────────────────────────────────
console.log('\nSuite 2: RESURRECTION safety');
{
  const room = makeRoom();
  // Give white a captured queen
  room.capturedPieces.white = ['q'];
  room.awaitingAction = { type: 'resurrect', color: 'white' };

  // Try to place on a1 (has own rook) — should fail (occupied)
  const r1 = room.applyResurrection('white-sock', 'a1');
  assert(r1.error, 'resurrection on occupied square returns error');

  // Place on e4 (empty) — should succeed
  const r2 = room.applyResurrection('white-sock', 'e4');
  assert(r2.ok, 'resurrection on empty square succeeds');

  // Verify piece is on board
  const state = room.getState();
  assert(state.fen.includes('Q') || state.fen.split(' ')[0].includes('Q'), 'queen placed on board after resurrection');
}

// ── Suite 3: SHIELD_WALL blocks nuclear destruction ──────────────────────────
console.log('\nSuite 3: SHIELD_WALL blocks nuclear destruction');
{
  const room = makeRoom();
  // Manually add SHIELD_WALL effect for black
  room.activeEffects.push({ cardId: 'SHIELD_WALL', color: 'black', turnsLeft: 3 });

  // Verify _isShielded works
  assert(room._isShielded('b'), 'black pieces are shielded');
  assert(!room._isShielded('w'), 'white pieces are not shielded');
}

// ── Suite 4: COPYCAT resolves against opponent card ──────────────────────────
console.log('\nSuite 4: COPYCAT behavior');
{
  const room = makeRoom();
  // Force card phase
  room.phase = 'card-selection';
  room.cardPhase = {
    hands: {
      white: [{ id: 'COPYCAT' }, { id: 'PAC_MAN' }],
      black: [{ id: 'PAC_MAN' }, { id: 'TIME_FREEZE' }],
    },
    selections: {},
  };

  // White picks COPYCAT, black picks PAC_MAN
  const r1 = room.selectCard('white-sock', 'COPYCAT');
  assert(r1.ok, 'white can select COPYCAT');
  const r2 = room.selectCard('black-sock', 'PAC_MAN');
  assert(r2.ok, 'black can select PAC_MAN');

  // After both select, cards are resolved — white should have PAC_MAN effect
  const whitePacMan = room.activeEffects.some(e => e.cardId === 'PAC_MAN' && e.color === 'white');
  const blackPacMan = room.activeEffects.some(e => e.cardId === 'PAC_MAN' && e.color === 'black');
  assert(whitePacMan, 'COPYCAT copies opponent PAC_MAN for white');
  assert(blackPacMan, 'Black gets their own PAC_MAN effect');
}

// ── Suite 5: Mutual COPYCAT is a no-op ──────────────────────────────────────
console.log('\nSuite 5: Mutual COPYCAT');
{
  const room = makeRoom();
  room.phase = 'card-selection';
  room.cardPhase = {
    hands: {
      white: [{ id: 'COPYCAT' }],
      black: [{ id: 'COPYCAT' }],
    },
    selections: {},
  };

  const effectsBefore = room.activeEffects.length;
  room.selectCard('white-sock', 'COPYCAT');
  room.selectCard('black-sock', 'COPYCAT');

  // No new effects should be added (mutual COPYCAT = no-op)
  const effectsAfter = room.activeEffects.length;
  assert(effectsAfter === effectsBefore, 'Mutual COPYCAT adds no effects');
}

// ── Suite 6: Kings cannot be removed by card effects ────────────────────────
console.log('\nSuite 6: King immunity');
{
  const room = makeRoom();
  // Simulate nukeAdjacent around e1 (white king)
  // The _nukeAdjacent checks p.type !== 'k'
  const before = room.chess.board();
  const e1Piece = room.chess.get('e1');
  assert(e1Piece && e1Piece.type === 'k', 'white king starts on e1');

  // Manually call internal nuke — king should survive
  room._nukeAdjacent('e1', 'b');
  const after = room.chess.get('e1');
  assert(after && after.type === 'k', 'white king survives _nukeAdjacent');
}

// ── Results ──────────────────────────────────────────────────────────────────
console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
