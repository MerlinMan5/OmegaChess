import { useState, useEffect } from 'react';
import { socket } from './socket';
import Board from './components/Board';
import CardHand from './components/CardHand';
import ActiveEffects from './components/ActiveEffects';
import GameStatus from './components/GameStatus';
import CapturedPieces from './components/CapturedPieces';
import './App.css';

export default function App() {
  const [screen, setScreen] = useState('lobby');
  const [roomId, setRoomId] = useState('');
  const [color, setColor] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [joinInput, setJoinInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) doJoin(room);

    socket.on('game-state', (state) => {
      setGameState(state);
      setScreen('game');
    });
    return () => { socket.off('game-state'); };
  }, []);

  function doCreate() {
    socket.emit('create-room', ({ roomId, color }) => {
      setRoomId(roomId);
      setColor(color);
      window.history.replaceState({}, '', `?room=${roomId}`);
    });
  }

  function doCreateVsBot() {
    socket.emit('create-room', ({ roomId, color }) => {
      setRoomId(roomId);
      setColor(color);
      window.history.replaceState({}, '', `?room=${roomId}`);
      socket.emit('add-bot', () => {});
    });
  }

  function goBack() {
    setScreen('lobby');
    setRoomId('');
    setColor(null);
    setGameState(null);
    setError('');
    window.history.replaceState({}, '', window.location.pathname);
  }

  function doJoin(id) {
    const rid = (id || joinInput).trim().toUpperCase();
    if (!rid) return;
    socket.emit('join-room', rid, (res) => {
      if (res.error) return setError(res.error);
      setRoomId(rid);
      setColor(res.color);
    });
  }

  if (screen === 'lobby') {
    return (
      <div className="lobby">
        <h1>♟ Omega Chess</h1>
        <p className="tagline">Chess with power-up cards · play vs friend or bot</p>
        <div className="play-modes">
          <button className="btn-primary" onClick={doCreate}>👥 Play vs Friend</button>
          <button className="btn-bot" onClick={doCreateVsBot}>🤖 Play vs Bot</button>
        </div>
        <div className="divider">or join existing</div>
        <div className="join-row">
          <input
            placeholder="Room code"
            value={joinInput}
            maxLength={6}
            onChange={e => setJoinInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && doJoin()}
          />
          <button onClick={() => doJoin()}>Join</button>
        </div>
        {error && <p className="error-msg">{error}</p>}
      </div>
    );
  }

  if (!gameState) return <div className="loading">Connecting…</div>;

  const isMyTurn = gameState.turn === color;
  const myHand = gameState.cardPhase?.hands?.[color];
  const iSelected = gameState.cardPhase?.selections?.[color];
  const oppSelected = gameState.cardPhase?.selections?.[color === 'white' ? 'black' : 'white'];
  const isAwaitingMe = gameState.awaitingAction?.color === color;
  const isFrozen = isMyTurn && (gameState.skippedTurns?.[color] ?? 0) > 0;

  return (
    <div className="app">
      <GameStatus gameState={gameState} color={color} roomId={roomId} />

      {gameState.phase === 'waiting' && !gameState.hasBot && (
        <div className="waiting-for-opponent">
          <span>⏳ Waiting for opponent to join…</span>
          <button className="btn-back" onClick={goBack}>← Back to menu</button>
        </div>
      )}

      {gameState.hasBot && (
        <div className="bot-banner">🤖 Playing vs Bot</div>
      )}
      {!gameState.hasBot && gameState.disconnected && gameState.disconnected !== color && (
        <div className="disconnect-banner">⚠ Opponent disconnected — waiting for them to reconnect…</div>
      )}

      <CapturedPieces capturedPieces={gameState.capturedPieces} color={color} />

      <Board
        fen={gameState.fen}
        color={color}
        gameState={gameState}
        isMyTurn={isMyTurn && !isFrozen}
        isAwaitingMe={isAwaitingMe}
      />

      {isFrozen && (
        <button className="pass-btn" onClick={() => socket.emit('pass-turn', () => {})}>
          🧊 Your turn is frozen — Pass Turn
        </button>
      )}

      {gameState.phase === 'card-selection' && myHand && !iSelected && (
        <CardHand
          cards={myHand}
          capturedPieces={gameState.capturedPieces?.[color] ?? []}
          onSelect={(cardId) => socket.emit('select-card', cardId, () => {})}
        />
      )}

      {gameState.phase === 'card-selection' && iSelected && (
        <div className="waiting-banner">
          {oppSelected ? '⚡ Applying cards…' : '⏳ Waiting for opponent to pick…'}
        </div>
      )}

      <ActiveEffects
        effects={gameState.activeEffects}
        pendingEffects={gameState.pendingEffects}
        color={color}
      />
    </div>
  );
}
