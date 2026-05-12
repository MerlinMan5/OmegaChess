import { CARD_META } from '../cards';

export default function ActiveEffects({ effects = [], pendingEffects = [], color }) {
  if (!effects.length && !pendingEffects.length) return null;
  return (
    <div className="active-effects">
      <h4>Active Effects</h4>
      {effects.map((e, i) => (
        <div key={i} className={`effect-row ${e.color === color ? 'mine' : 'theirs'}`}>
          {CARD_META[e.cardId]?.emoji} {CARD_META[e.cardId]?.name} — {e.color} — {Math.ceil(e.turnsRemaining / 2)} turn{e.turnsRemaining > 2 ? 's' : ''} left
        </div>
      ))}
      {pendingEffects.map((e, i) => (
        <div key={i} className="effect-row pending">
          ⏳ {CARD_META[e.cardId]?.emoji} {CARD_META[e.cardId]?.name} triggers in {Math.ceil(e.turnsUntil / 2)} turn{e.turnsUntil > 2 ? 's' : ''}
        </div>
      ))}
    </div>
  );
}
