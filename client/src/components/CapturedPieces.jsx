const UNICODE = {
  wk:'♔',wq:'♕',wr:'♖',wb:'♗',wn:'♘',wp:'♙',
  bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'♟',
};

const PIECE_VALUE = { q: 9, r: 5, b: 3, n: 3, p: 1, k: 0 };

export default function CapturedPieces({ capturedPieces, color }) {
  if (!capturedPieces) return null;

  // capturedPieces[color] = pieces captured FROM that color (i.e. opponent took them)
  // Show pieces I've captured = pieces taken from opponent
  const opp = color === 'white' ? 'black' : 'white';
  const iCaptured = capturedPieces[opp] ?? [];  // pieces I took from opponent
  const oppCaptured = capturedPieces[color] ?? []; // pieces opponent took from me

  const myAdvantage = iCaptured.reduce((s, p) => s + (PIECE_VALUE[p] || 0), 0)
                    - oppCaptured.reduce((s, p) => s + (PIECE_VALUE[p] || 0), 0);

  const oppColorChar = opp === 'white' ? 'w' : 'b';
  const myColorChar = color === 'white' ? 'w' : 'b';

  return (
    <div className="captured-wrap">
      <div className="captured-row">
        <span className="captured-label">You took:</span>
        <span className="captured-pieces">
          {iCaptured.map((p, i) => (
            <span key={i} className="cap-piece">{UNICODE[oppColorChar + p]}</span>
          ))}
          {myAdvantage > 0 && <span className="advantage">+{myAdvantage}</span>}
        </span>
      </div>
      <div className="captured-row">
        <span className="captured-label">They took:</span>
        <span className="captured-pieces">
          {oppCaptured.map((p, i) => (
            <span key={i} className="cap-piece">{UNICODE[myColorChar + p]}</span>
          ))}
          {myAdvantage < 0 && <span className="advantage disadvantage">{myAdvantage}</span>}
        </span>
      </div>
    </div>
  );
}
