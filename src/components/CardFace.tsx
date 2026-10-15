import type { Card, Gender } from '../types';
import { Icon } from './Icon';

const GENDER: Record<Gender, string> = { m: 'м. р.', f: 'ж. р.', n: 'ср. р.', pl: 'мн. ч.' };

export function Meta({ card }: { card: Card }) {
  if (!card.gender && !card.hint) return null;
  return (
    <div className="meta">
      {card.gender && <span className={`gender g-${card.gender}`}>{GENDER[card.gender]}</span>}
      {card.hint && <span className="hint">{card.hint}</span>}
    </div>
  );
}

export function SpeakButton({ onClick, label = 'Произнести' }: { onClick: () => void; label?: string }) {
  return (
    <button className="icon-btn speak" onClick={onClick} aria-label={label} title={label}>
      <Icon name="speaker" />
    </button>
  );
}

export function Details({ card, onSpeak }: { card: Card; onSpeak?: (t: string) => void }) {
  return (
    <div className="details">
      {card.image && <img className="card-img" src={`/media/${card.image}`} alt="" loading="lazy" />}
      {card.example && (
        <div className="example">
          <p className="ex-src" lang={card.lang}>
            {card.example}
            {onSpeak && (
              <button className="inline-speak" onClick={() => onSpeak(card.example!)} aria-label="Произнести пример">
                <Icon name="speaker" size={16} />
              </button>
            )}
          </p>
          {card.exampleTr && <p className="ex-tr">{card.exampleTr}</p>}
        </div>
      )}
      {card.note && <p className="note">{card.note}</p>}
    </div>
  );
}
