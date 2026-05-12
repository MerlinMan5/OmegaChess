import { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { socket } from '../socket';
import PromotionModal from './PromotionModal';

const UNICODE = {
  k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟',
};

function toSquare(row, col, flipped) {
  const f = flipped ? 7 - col : col;
  const r = flipped ? row : 7 - row;
  return String.fromCharCode(97 + f) + (r + 1);
}

function isPromoMove(from, to, piece, colorChar) {
  if (piece?.type !== 'p') return false;
  const rank = to[1];
  return (colorChar === 'w' && rank === '8') || (colorChar === 'b' && rank === '1');
}

export default function Board({ fen, color, gameState, isMyTurn, isAwaitingMe }) {
  const [chess] = useState(() => new Chess());
  const [selected, setSelected] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [swapFirst, setSwapFirst] = useState(null);
  const [pendingPromo, setPendingPromo] = useState(null);
  const flipped = color === 'black';

  useEffect(() => {
    chess.load(fen);
    setSelected(null);
    setLegalTargets([]);
    setSwapFirst(null);
    setPendingPromo(null);
  }, [fen]);

  const board = chess.board();
  const { awaitingAction, inCheck, lastMove } = gameState;
  const myColorChar = color === 'white' ? 'w' : 'b';

  function sendMove(from, to, promotion) {
    socket.emit('move', { from, to, ...(promotion ? { promotion } : {}) }, (r) => {
      if (r.error) console.warn(r.error);
    });
  }

  function handleClick(sq) {
    if (isAwaitingMe && awaitingAction?.type === 'resurrect') {
      if (!chess.get(sq)) socket.emit('resurrect-piece', sq, (r) => { if (r.error) console.warn(r.error); });
      return;
    }
    if (isAwaitingMe && awaitingAction?.type === 'swap') {
      const p = chess.get(sq);
      if (!p || p.color !== myColorChar || p.type === 'k') return;
      if (!swapFirst) { setSwapFirst(sq); }
      else if (swapFirst === sq) { setSwapFirst(null); }
      else {
        socket.emit('swap-pieces', [swapFirst, sq], (r) => { if (r.error) console.warn(r.error); setSwapFirst(null); });
      }
      return;
    }
    if (!isMyTurn) return;
    const piece = chess.get(sq);
    if (selected) {
      if (legalTargets.includes(sq)) {
        const movingPiece = chess.get(selected);
        if (isPromoMove(selected, sq, movingPiece, myColorChar)) {
          setPendingPromo({ from: selected, to: sq });
          setSelected(null); setLegalTargets([]);
        } else {
          sendMove(selected, sq);
          setSelected(null); setLegalTargets([]);
        }
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
        if (p?.type === 'k' && p.color === turnChar) { checkSq = String.fromCharCode(97+f)+(r+1); break outer; }
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
      const isLight = (br + bf) % 2 !== 0;
      const isSel = selected === sq || swapFirst === sq;
      const isLegal = legalTargets.includes(sq);
      const isLastFrom = lastMove?.from === sq;
      const isLastTo = lastMove?.to === sq;
      const showFile = flipped ? row === 0 : row === 7;
      const showRank = flipped ? col === 7 : col === 0;
      const fileLetter = String.fromCharCode(flipped ? 104 - col : 97 + col);
      const rankNum = flipped ? row + 1 : 8 - row;

      let cls = `sq ${isLight ? 'light' : 'dark'}`;
      if (isSel) cls += ' sel';
      else if (isLastFrom || isLastTo) cls += ' last-move';
      if (checkSq === sq) cls += ' check-sq';

      cells.push(
        <div key={sq} className={cls} onClick={() => handleClick(sq)}>
          {showRank && <span className={`coord rank ${isLight ? 'dark-text' : 'light-text'}`}>{rankNum}</span>}
          {showFile && <span className={`coord file ${isLight ? 'dark-text' : 'light-text'}`}>{fileLetter}</span>}
          {isLegal && !piece && <div className="legal-dot" />}
          {isLegal && piece && <div className="legal-cap-ring" />}
          {piece && (
            <span className={`piece ${piece.color === 'w' ? 'piece-white' : 'piece-black'}`}>
              {UNICODE[piece.type]}
            </span>
          )}
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
      {pendingPromo && (
        <PromotionModal
          color={color}
          onSelect={(p) => { sendMove(pendingPromo.from, pendingPromo.to, p); setPendingPromo(null); }}
        />
      )}
    </div>
  );
}
