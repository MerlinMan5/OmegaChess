const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const { GameRoom } = require('./game');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || '*', methods: ['GET', 'POST'] },
});

const rooms = new Map();

app.get('/health', (_req, res) => res.json({ ok: true }));

// Dev-only: force specific card hands for intersection testing
if (process.env.NODE_ENV !== 'production') {
  const { CARDS } = require('./cards');
  app.use(express.json());
  app.post('/test/set-hands', (req, res) => {
    const { roomId, white, black } = req.body;
    const room = rooms.get(roomId);
    if (!room) return res.status(404).json({ error: 'room not found' });
    if (room.phase !== 'card-selection') return res.status(400).json({ error: 'not in card-selection' });
    if (white) room.cardPhase.hands.white = white.map(id => CARDS[id]).filter(Boolean);
    if (black) room.cardPhase.hands.black = black.map(id => CARDS[id]).filter(Boolean);
    broadcast(roomId);  // push updated hands to connected clients
    res.json({ ok: true });
  });
}

function broadcast(roomId) {
  const room = rooms.get(roomId);
  if (room) io.to(roomId).emit('game-state', room.getState());
}

io.on('connection', (socket) => {
  socket.on('create-room', (cb) => {
    const roomId = uuidv4().slice(0, 6).toUpperCase();
    const room = new GameRoom(roomId);
    room.addPlayer(socket.id, 'white');
    rooms.set(roomId, room);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.color = 'white';
    cb({ roomId, color: 'white' });
    broadcast(roomId);
  });

  socket.on('join-room', (roomId, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb({ error: 'Room not found' });
    if (room.isFull()) return cb({ error: 'Room is full' });
    room.addPlayer(socket.id, 'black');
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.color = 'black';
    cb({ color: 'black' });
    broadcast(roomId);
  });

  socket.on('add-bot', (difficulty, cb) => {
    const d = typeof difficulty === 'string' ? difficulty : 'medium';
    const cbFn = typeof difficulty === 'function' ? difficulty : (cb || (() => {}));
    const room = rooms.get(socket.data.roomId);
    if (!room) return cbFn({ error: 'No room' });
    if (room.isFull()) return cbFn({ error: 'Room is full' });
    room.addBot('black', d);
    room.onBotAction = () => broadcast(socket.data.roomId);
    cbFn({ ok: true });
    broadcast(socket.data.roomId);
  });

  socket.on('move', (move, cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb({ error: 'No room' });
    const result = room.applyMove(socket.id, move);
    cb(result);
    if (result.ok) broadcast(socket.data.roomId);
  });

  socket.on('pass-turn', (cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb({ error: 'No room' });
    const result = room.passTurn(socket.id);
    cb(result);
    if (result.ok) broadcast(socket.data.roomId);
  });

  socket.on('select-card', (cardId, cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb({ error: 'No room' });
    const result = room.selectCard(socket.id, cardId);
    cb(result);
    if (result.ok) broadcast(socket.data.roomId);
  });

  socket.on('swap-pieces', (squares, cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb({ error: 'No room' });
    const result = room.applySwap(socket.id, squares);
    cb(result);
    if (result.ok) broadcast(socket.data.roomId);
  });

  socket.on('resurrect-piece', (square, cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb({ error: 'No room' });
    const result = room.applyResurrection(socket.id, square);
    cb(result);
    if (result.ok) broadcast(socket.data.roomId);
  });

  socket.on('resign', (cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb({ error: 'No room' });
    const result = room.resign(socket.id);
    cb(result);
    if (result.ok) broadcast(socket.data.roomId);
  });

  socket.on('offer-draw', (cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb({ error: 'No room' });
    const result = room.offerDraw(socket.id);
    cb(result);
    if (result.ok) broadcast(socket.data.roomId);
  });

  socket.on('accept-draw', (cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb({ error: 'No room' });
    const result = room.acceptDraw(socket.id);
    cb(result);
    if (result.ok) broadcast(socket.data.roomId);
  });

  socket.on('decline-draw', (cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb({ error: 'No room' });
    const result = room.declineDraw(socket.id);
    cb(result);
    if (result.ok) broadcast(socket.data.roomId);
  });

  socket.on('rematch', (cb) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return cb({ error: 'No room' });
    if (!room.isFull()) return cb({ error: 'Need both players' });
    room.resetGame();
    cb({ ok: true });
    broadcast(socket.data.roomId);
  });

  socket.on('disconnect', () => {
    const { roomId } = socket.data;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    room.removePlayer(socket.id);
    if (room.isEmpty()) rooms.delete(roomId);
    else broadcast(roomId);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Listening on :${PORT}`));
