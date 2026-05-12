import { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { socket } from '../socket';

const UNICODE = {
  wk:'♔',wq:'♕',wr:'♖',wb:'♗',wn:'♘',wp:'♙',
  bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'♟',
};

function toSquare(row, col, flipped) {
  const f = flipped ? 7 - col : col;
  const r = flipped ? row : 7 - row;
  return String.fromCharCode(97 + f) + (r + 1);
}

export default function Board({ fen, color, gameState, isMyTurn, isAwaitingMe }) {
  const [chess] = useState(() => new Chess());
  const [selected, setSelected] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [swapFirst, setSwapFirst] = useState(null);
  const flipped = color === 'black';

  useEffect(() => {
    chess.load(fen);
    setSelected(null);
    setLegalTargets([]);
    setSwapFirst(null);
  }, [fen]);

  const board = chess.board();
  const { awaitingAction, inCheck, lastMove } = gameState;
  const myColorChar = color === 'white' ? 'w' : 'b';

  function handleClick(sq) {
    if (isAwaitingMe && awaitingAction?.type === 'resurrect') {
      if (!chess.get(sq))
        socket.emit('resurrect-piece', sq, (r) => { if (r.error) console.warn(r.error); });
      return;
    }
    if (isAwaitingMe && awaitingAction?.type === 'swap') {
      const p = chess.get(sq);
      if (!p || p.color !== myColorChar || p.type === 'k') return;
      if (!swapFirst) { setSwapFirst(sq); }
      else if (swapFirst === sq) { setSwapFirst(null); }
      else {
        socket.emit('swap-pieces', [swapFirst, sq], (r) => {
          if (r.error) console.warn(r.error);
          setSwapFirst(null);
        });
      }
      return;
    }
    if (!isMyTurn) return;
    const piece = chess.get(sq);
    if (selected) {
      if (legalTargets.includes(sq)) {
        const mv = { from: selected, to: sq };
        const mp = chess.get(selected);
        if (mp?.type === 'p') {
          const rank = sq[1];
          if ((myColorChar === 'w' && rank === '8') || (myColorChar === 'b' && rank === '1'))
            mv.promotion = 'q';
        }
        socket.emit('move', mv, (r) => { if (r.error) console.warn(r.error); });
        setSelected(null); setLegalTargets([]);
        return;
      }
      if (piece?.color === myColorChar) {
        setSelected(sq);
        setLegalTargets(chess.moves({ square: sq, verbose: true }).map(m => m.to));
        return;
      }
      setSelected(null); setLegalTargets([]);
      return;
    }
    if (piece?.color === myColorChar) {
      setSelected(sq);
      setLegalTargets(chess.moves({ square: sq, verbose: true }).map(m => m.to));
    }
  }

  let checkSq = null;
  if (inCheck) {
    const turnChar = gameState.turn === 'white' ? 'w' : 'b';
    outer: for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p?.type === 'k' && p.color === turnChar) {
          checkSq = String.fromCharCode(97 + f) + (r + 1);
          break outer;
        }
      }
  }

  const rows = [];
  for (let row = 0; row < 8; row++) {
    const cells = [];
    for (let col = 0; col < 8; col++) {
      const sq = toSquare(row, col, flipped);
      const br = flipped ? 7 - row : row;
      const bf = flipped ? 7 - col : col;
      const piece = board[br]?.[bf];
      const pieceKey = piece ? `${piece.color}${piece.type}` : null;
      const isLight = (br + bf) % 2 !== 0;
      const isSel = selected === sq || swapFirst === sq;
      const isLegal = legalTargets.includes(sq);
      const isCheck = checkSq === sq;
      const isLastFrom = lastMove?.from === sq;
      const isLastTo = lastMove?.to === sq;

      let cls = `sq ${isLight ? 'light' : 'dark'}`;
      if (isSel) cls += ' sel';
      else if (isLastFrom || isLastTo) cls += ' last-move';
      if (isCheck) cls += ' check-sq';

      cells.push(
        <div key={sq} className={cls} onClick={() => handleClick(sq)}>
          {isLegal && !piece && <div className="legal-dot" />}
          {isLegal && piece && <div className="legal-cap-ring" />}
          {piece && <span className="piece">{UNICODE[pieceKey]}</span>}
        </div>
      );
    }
    rows.push(<div key={row} className="board-row">{cells}</div>);
  }

  return (
    <div className="board-wrap">
      {isAwaitingMe && awaitingAction?.type === 'resurrect' && (
        <div className="action-banner">✨ Click any empty square to place your resurrected piece</div>
      )}
      {isAwaitingMe && awaitingAction?.type === 'swap' && (
        <div className="action-banner">
          🔄 {swapFirst ? 'Now click the second piece to swap' : 'Click two of your pieces to swap'}
        </div>
      )}
      <div className="board">{rows}</div>
    </div>
  );
}
