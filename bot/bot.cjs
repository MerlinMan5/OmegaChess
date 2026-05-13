/**
 * Omega Chess random-move bot.
 * Usage: node bot.cjs <ROOM_CODE> [SERVER_URL]
 * Example: node bot.cjs ABC123
 *          node bot.cjs ABC123 https://omegachess-production.up.railway.app
 */
const { io } = require('socket.io-client');
const { Chess } = require('chess.js');

const roomCode = process.argv[2];
const SERVER = process.argv[3] || process.env.SERVER_URL || 'http://localhost:3001';

if (!roomCode) {
  console.error('Usage: node bot.cjs <ROOM_CODE> [SERVER_URL]');
  process.exit(1);
}

console.log(`Connecting to ${SERVER} and joining room ${roomCode}…`);
const socket = io(SERVER);

let myColor = null;

socket.on('connect', () => {
  socket.emit('join-room', roomCode, (res) => {
    if (res.error) { console.error('Join failed:', res.error); process.exit(1); }
    myColor = res.color;
    console.log(`Bot joined as ${myColor}`);
  });
});

socket.on('game-state', (state) => {
  // Small delay so moves feel a little natural
  setTimeout(() => handleState(state), 400 + Math.random() * 400);
});

function handleState(state) {
  if (!myColor) return;

  // Game over — request rematch after a pause
  if (state.gameOver) {
    console.log('Game over. Requesting rematch in 3s…');
    setTimeout(() => socket.emit('rematch', () => {}), 3000);
    return;
  }

  // Card selection phase — pick a random available card
  if (state.phase === 'card-selection') {
    const hand = state.cardPhase?.hands?.[myColor];
    const alreadyPicked = state.cardPhase?.selections?.[myColor];
    if (hand && !alreadyPicked) {
      const card = hand[Math.floor(Math.random() * hand.length)];
      console.log(`Picking card: ${card.name}`);
      socket.emit('select-card', card.id, (res) => {
        if (res?.error) console.warn('Card error:', res.error);
      });
    }
    return;
  }

  // Awaiting action (Swap Places or Resurrection card)
  if (state.awaitingAction?.color === myColor) {
    const { type } = state.awaitingAction;
    const chess = new Chess(state.fen);
    const board = chess.board();
    const myChar = myColor === 'white' ? 'w' : 'b';

    if (type === 'swap') {
      const pieces = [];
      for (let r = 0; r < 8; r++)
        for (let f = 0; f < 8; f++)
          if (board[r][f]?.color === myChar && board[r][f]?.type !== 'k')
            pieces.push(String.fromCharCode(97 + f) + (r + 1));
      if (pieces.length >= 2) {
        const [a, b] = pieces.sort(() => Math.random() - 0.5).slice(0, 2);
        console.log(`Swapping ${a} and ${b}`);
        socket.emit('swap-pieces', [a, b], (res) => {
          if (res?.error) console.warn('Swap error:', res.error);
        });
      }
    } else if (type === 'resurrect') {
      const empty = [];
      for (let r = 0; r < 8; r++)
        for (let f = 0; f < 8; f++)
          if (!board[r][f])
            empty.push(String.fromCharCode(97 + f) + (r + 1));
      if (empty.length) {
        const sq = empty[Math.floor(Math.random() * empty.length)];
        console.log(`Resurrecting to ${sq}`);
        socket.emit('resurrect-piece', sq, (res) => {
          if (res?.error) console.warn('Resurrect error:', res.error);
        });
      }
    }
    return;
  }

  if (state.phase !== 'play' || state.turn !== myColor) return;

  // Frozen turn (Time Freeze card) — pass
  if ((state.skippedTurns?.[myColor] ?? 0) > 0) {
    console.log('Turn frozen — passing');
    socket.emit('pass-turn', (res) => {
      if (res?.error) console.warn('Pass error:', res.error);
    });
    return;
  }

  // Pick a random legal move
  const chess = new Chess(state.fen);
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return;

  const m = moves[Math.floor(Math.random() * moves.length)];
  const payload = { from: m.from, to: m.to };
  if (m.promotion) payload.promotion = 'q'; // always queen
  console.log(`Playing ${m.san}`);
  socket.emit('move', payload, (res) => {
    if (res?.error) console.warn('Move error:', res.error);
  });
}

socket.on('disconnect', () => console.log('Bot disconnected'));
socket.on('connect_error', (e) => console.error('Connection error:', e.message));
