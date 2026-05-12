import Card from './Card';

export default function CardHand({ cards, capturedPieces, onSelect }) {
  return (
    <div className="card-hand">
      <h3>Choose a power-up</h3>
      <div className="cards">
        {cards.map(card => (
          <Card
            key={card.id}
            card={card}
            disabled={card.id === 'RESURRECTION' && capturedPieces.length === 0}
            onSelect={() => onSelect(card.id)}
          />
        ))}
      </div>
    </div>
  );
}
