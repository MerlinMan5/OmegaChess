export default function MoveHistory({ moveHistory = [] }) {
  if (moveHistory.length === 0) return null;

  const pairs = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    pairs.push({ n: Math.floor(i / 2) + 1, w: moveHistory[i], b: moveHistory[i + 1] });
  }

  return (
    <div className="move-history">
      <h4>Moves</h4>
      <div className="move-list">
        {pairs.map(({ n, w, b }) => (
          <div key={n} className="move-pair">
            <span className="move-num">{n}.</span>
            <span className="move-san">{w}</span>
            <span className="move-san">{b ?? ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
