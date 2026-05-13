export default function Card({ card, onSelect, disabled }) {
  return (
    <div className={`card${disabled ? ' disabled' : ''}`} data-card-id={card.id} onClick={disabled ? undefined : onSelect}>
      <div className="card-emoji">{card.emoji}</div>
      <div className="card-name">{card.name}</div>
      <div className="card-desc">{card.description}</div>
    </div>
  );
}
