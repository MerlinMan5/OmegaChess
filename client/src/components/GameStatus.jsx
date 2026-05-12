export default function GameStatus({ gameState, color, roomId }) {
  const { turn, fullMoves, gameOver, isCheckmate, isStalemate, inCheck, players, activeEffects = [], bonusMoves = {} } = gameState;
  const shareUrl = `${window.location.origin}?room=${roomId}`;

  if (gameOver) {
    let msg = 'Game over!';
    if (isCheckmate) msg = `${turn === 'white' ? 'Black' : 'White'} wins by checkmate!`;
    else if (isStalemate) msg = 'Draw by stalemate!';
    return (
      <div className="game-status gameover">
        {msg}
        <button className="rematch-btn" onClick={() => import('../socket').then(m => m.socket.emit('rematch', () => {}))}>Play again</button>
      </div>
    );
  }

  const waiting = !players?.white || !players?.black;
  const isMyTurn = turn === color;
  const hasBonus = (bonusMoves[color] ?? 0) > 0;

  // Active effects relevant to current player
  const myEffects = activeEffects.filter(e => e.color === color);
  const specialMovesActive = myEffects.some(e => ['PAC_MAN','PAWN_RUSH','KNIGHTS_DOMAIN'].includes(e.cardId));

  let turnLabel = isMyTurn ? '● Your turn' : `${turn}'s turn`;
  if (hasBonus && isMyTurn) turnLabel = '⚡ Bonus move!';
  if (inCheck) turnLabel += ' — CHECK!';
  const turnClass = 'turn-label' + (isMyTurn ? ' your-turn' : '') + (inCheck ? ' check' : '');

  return (
    <div className="game-status">
      <div className="status-left">
        <span className="you-are">Playing as <strong>{color}</strong></span>
        {waiting
          ? <span className="waiting-label">⏳ Waiting for opponent…</span>
          : <span className={turnClass}>{turnLabel}</span>
        }
        {specialMovesActive && isMyTurn && (
          <span className="special-hint">✨ Special moves active — try your pieces!</span>
        )}
        <span className="move-count">Move {fullMoves}</span>
      </div>
      <div className="status-right">
        <span className="room-code">Room: <code>{roomId}</code></span>
        <button className="copy-btn" onClick={() => navigator.clipboard.writeText(shareUrl)}>Copy link</button>
      </div>
    </div>
  );
}
