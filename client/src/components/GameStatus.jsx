export default function GameStatus({ gameState, color, roomId }) {
  const { turn, fullMoves, gameOver, winner, inCheck, players, activeEffects = [], bonusMoves = {}, phase, isResignation, resignedColor, isDraw, drawOffer, hasBot, lastEvent } = gameState;
  const shareUrl = `${window.location.origin}?room=${roomId}`;

  if (gameOver) {
    let msg = 'Game over!';
    if (isResignation) {
      const winnerColor = resignedColor === 'white' ? 'Black' : 'White';
      msg = resignedColor === color ? `You resigned. ${winnerColor} wins!` : `Opponent resigned. You win!`;
    } else if (isDraw) {
      msg = 'Draw by agreement!';
    } else if (lastEvent?.type === 'KING_CAPTURED' || winner) {
      const winnerColor = winner ? (winner.charAt(0).toUpperCase() + winner.slice(1)) : '';
      msg = winner === color ? '👑 You captured the king! You win!' : `${winnerColor} captured the king and wins!`;
    }
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
  const myEffects = activeEffects.filter(e => e.color === color);
  const specialMovesActive = myEffects.some(e => ['PAC_MAN','PAWN_RUSH','KNIGHTS_DOMAIN'].includes(e.cardId));

  // Cards countdown
  const nextCardIn = phase === 'card-selection' ? 0 : (3 - (fullMoves % 3)) || 3;

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
          <span className="special-hint">✨ Special moves active!</span>
        )}
        <span className="move-count">Move {fullMoves}</span>
      </div>
      <div className="status-right">
        <span className="room-code">Room: <code>{roomId}</code></span>
        <button className="copy-btn" onClick={() => navigator.clipboard.writeText(shareUrl)}>Copy link</button>
        {!waiting && (
          <span className="card-countdown">
            {phase === 'card-selection'
              ? '🃏 Pick a card!'
              : `🃏 Cards in ${nextCardIn} ${nextCardIn === 1 ? 'move' : 'moves'}`
            }
          </span>
        )}
      </div>
    </div>
  );
}
