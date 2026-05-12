export default function GameStatus({ gameState, color, roomId }) {
  const { turn, phase, fullMoves, gameOver, isCheckmate, isStalemate, inCheck, players } = gameState;
  const shareUrl = `${window.location.origin}?room=${roomId}`;

  if (gameOver) {
    let msg = 'Game over!';
    if (isCheckmate) msg = `${turn === 'white' ? 'Black' : 'White'} wins by checkmate!`;
    else if (isStalemate) msg = 'Draw by stalemate!';
    return <div className="game-status gameover">{msg}</div>;
  }

  const waiting = !players?.white || !players?.black;
  const isMyTurn = turn === color;

  let turnLabel = isMyTurn ? '● Your turn' : `${turn}\'s turn`;
  let turnClass = 'turn-label' + (isMyTurn ? ' your-turn' : '') + (inCheck ? ' check' : '');
  if (inCheck) turnLabel += ' — CHECK!';

  return (
    <div className="game-status">
      <div className="status-left">
        <span className="you-are">Playing as <strong>{color}</strong></span>
        {waiting
          ? <span className="waiting-label">⏳ Waiting for opponent…</span>
          : <span className={turnClass}>{turnLabel}</span>
        }
        <span className="move-count">Move {fullMoves}</span>
      </div>
      <div className="status-right">
        <span className="room-code">Room: <code>{roomId}</code></span>
        <button className="copy-btn" onClick={() => navigator.clipboard.writeText(shareUrl)}>Copy link</button>
      </div>
    </div>
  );
}
