import { useState, useEffect } from 'react';
import { socket } from './socket';
import Board from './components/Board';
import CardHand from './components/CardHand';
import ActiveEffects from './components/ActiveEffects';
import GameStatus from './components/GameStatus';
import CapturedPieces from './components/CapturedPieces';
import MoveHistory from './components/MoveHistory';
import './App.css';

export default function App() {
  const [screen, setScreen] = useState('lobby');
  const [roomId, setRoomId] = useState('');
  const [color, setColor] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [joinInput, setJoinInput] = useState('');
  const [error, setError] = useState('');
  const [botDifficulty, setBotDifficulty] = useState('medium');
  const [resignConfirm, setResignConfirm] = useState(false);

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
      socket.emit('add-bot', botDifficulty, () => {});
    });
  }

  function doResign() {
    if (!resignConfirm) { setResignConfirm(true); return; }
    socket.emit('resign', () => {});
    setResignConfirm(false);
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
          <div className="bot-row">
            <button className="btn-bot" onClick={doCreateVsBot}>🤖 Play vs Bot</button>
            <select className="difficulty-select" value={botDifficulty} onChange={e => setBotDifficulty(e.target.value)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
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
  const drawOfferedByMe = gameState.drawOffer === color;
  const drawOfferedToMe = gameState.drawOffer && gameState.drawOffer !== color;

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

      {gameState.phase !== 'gameover' && gameState.phase !== 'waiting' && (
        <div className="game-controls">
          {drawOfferedToMe ? (
            <div className="draw-offer-incoming">
              <span>Opponent offers a draw</span>
              <button className="btn-accept-draw" onClick={() => socket.emit('accept-draw', () => {})}>Accept</button>
              <button className="btn-decline-draw" onClick={() => socket.emit('decline-draw', () => {})}>Decline</button>
            </div>
          ) : drawOfferedByMe ? (
            <span className="draw-pending">⏳ Draw offer pending…</span>
          ) : (
            <button className="btn-draw" onClick={() => socket.emit('offer-draw', () => {})}>½ Offer Draw</button>
          )}
          {resignConfirm ? (
            <div className="resign-confirm">
              <span>Resign?</span>
              <button className="btn-resign-yes" onClick={doResign}>Yes</button>
              <button className="btn-resign-no" onClick={() => setResignConfirm(false)}>No</button>
            </div>
          ) : (
            <button className="btn-resign" onClick={doResign}>Resign</button>
          )}
        </div>
      )}

      <MoveHistory moveHistory={gameState.moveHistory} />
    </div>
  );
}
