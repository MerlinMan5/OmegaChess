const UNICODE = { wq:'♕',wr:'♖',wb:'♗',wn:'♘', bq:'♛',br:'♜',bb:'♝',bn:'♞' };
const PIECES = ['q','r','b','n'];

export default function PromotionModal({ color, onSelect }) {
  const cc = color === 'white' ? 'w' : 'b';
  return (
    <div className="promo-overlay">
      <div className="promo-modal">
        <p>Promote pawn to…</p>
        <div className="promo-choices">
          {PIECES.map(p => (
            <button key={p} className="promo-btn" onClick={() => onSelect(p)}>
              {UNICODE[cc + p]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
