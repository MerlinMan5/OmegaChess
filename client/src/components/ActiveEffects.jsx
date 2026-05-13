import { CARD_META } from '../cards';

export default function ActiveEffects({ effects = [], pendingEffects = [], color, lastEvent }) {
  if (!effects.length && !pendingEffects.length && !lastEvent) return null;

  return (
    <div className="active-effects">
      <h4>Active Effects</h4>

      {lastEvent?.type === 'OMEGA_CHAD' && (
        <div className="effect-row event-flash">
          💀 Omega Chad Energy triggered!
          {lastEvent.destroyed.length > 0
            ? ` Destroyed: ${lastEvent.destroyed.join(', ')}`
            : ' No pieces were in range.'}
        </div>
      )}

      {effects.map((e, i) => {
        const meta = CARD_META[e.cardId];
        const isBoth = e.color === 'both';
        const isMine = e.color === color;
        const cls = `effect-row ${isBoth ? 'both' : isMine ? 'mine' : 'theirs'}`;
        const scope = isBoth ? 'Both' : isMine ? 'You' : 'Opponent';
        const turnsLeft = Math.ceil(e.turnsRemaining / 2);
        return (
          <div key={i} className={cls}>
            <span className="effect-icon">{meta?.emoji}</span>
            <span className="effect-body">
              <span className="effect-name">{meta?.name}</span>
              <span className="effect-desc">{meta?.desc}</span>
            </span>
            <span className="effect-meta">{scope} · {turnsLeft}t</span>
          </div>
        );
      })}

      {pendingEffects.map((e, i) => {
        const meta = CARD_META[e.cardId];
        const turnsUntil = Math.ceil(e.turnsUntil / 2);
        return (
          <div key={i} className="effect-row pending">
            <span className="effect-icon">{meta?.emoji}</span>
            <span className="effect-body">
              <span className="effect-name">{meta?.name}</span>
              <span className="effect-desc">{meta?.desc}</span>
            </span>
            <span className="effect-meta">⏳ in {turnsUntil}t</span>
          </div>
        );
      })}
    </div>
  );
}
