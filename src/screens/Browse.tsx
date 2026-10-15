import { useMemo, useState } from 'react';
import type { Card } from '../types';
import { useApp } from '../state';
import { formatInterval, keyOf, STATUS_LABEL, statusOf } from '../lib/srs';
import type { CardStatus } from '../lib/srs';
import { stripMarks } from '../lib/answer';
import { speak } from '../lib/tts';
import { Details, Meta, SpeakButton } from '../components/CardFace';
import { Icon } from '../components/Icon';

type Filter = 'all' | CardStatus | 'hard';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новые' },
  { id: 'learning', label: 'Учу' },
  { id: 'young', label: 'Повторяю' },
  { id: 'mature', label: 'Знаю' },
  { id: 'hard', label: 'Трудные' },
  { id: 'suspended', label: 'Пропускаю' },
];

const fold = (s: string) => stripMarks(s.toLowerCase());

export function Browse() {
  const { cards, progress, settings, updateSettings, resetCard, language } = useApp();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string>();
  const [limit, setLimit] = useState(100);
  const suspended = useMemo(() => new Set(settings.suspended), [settings.suspended]);

  const rows = useMemo(() => {
    const needle = fold(q.trim());
    return cards
      .map((c) => {
        const rec = progress.get(keyOf(c.id, 'recognize'));
        const cal = progress.get(keyOf(c.id, 'recall'));
        const lapses = (rec?.fsrs.lapses ?? 0) + (cal?.fsrs.lapses ?? 0);
        return { card: c, rec, cal, lapses, status: statusOf(rec, suspended.has(c.id)) };
      })
      .filter((r) => {
        if (filter === 'hard' && r.lapses < 3) return false;
        if (filter !== 'all' && filter !== 'hard' && r.status !== filter) return false;
        if (!needle) return true;
        const c = r.card;
        return [c.front, c.back, c.example ?? '', c.note ?? '', ...(c.tags ?? [])].some((f) => fold(f).includes(needle));
      });
  }, [cards, progress, suspended, q, filter]);

  const say = (c: Card) =>
    language && speak(c.audio ?? c.front, language.tts, settings.ttsRate, settings.voices[language.code]);

  const toggleSuspend = (id: string) => {
    const next = suspended.has(id) ? settings.suspended.filter((x) => x !== id) : [...settings.suspended, id];
    updateSettings({ suspended: next });
  };

  return (
    <div className="screen browse">
      <h1>Карточки</h1>
      <label className="search">
        <Icon name="search" size={18} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по слову, переводу, примеру"
          type="search"
        />
      </label>
      <div className="chips" role="radiogroup" aria-label="Фильтр">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="radio"
            aria-checked={filter === f.id}
            className={filter === f.id ? 'on' : ''}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <p className="count">
        {rows.length} из {cards.length}
      </p>

      {rows.length === 0 && <p className="empty">Под этот фильтр ничего не подходит.</p>}

      <ul className="card-list">
        {rows.slice(0, limit).map(({ card, rec, cal, status, lapses }) => {
          const isOpen = open === card.id;
          return (
            <li key={card.id} className={`row ${isOpen ? 'open' : ''}`}>
              <button className="row-main" onClick={() => setOpen(isOpen ? undefined : card.id)} aria-expanded={isOpen}>
                <span className="row-front" lang={card.lang}>
                  {card.front}
                </span>
                <span className="row-back">{card.back}</span>
                <span className={`status s-${status}`}>{STATUS_LABEL[status]}</span>
              </button>
              {isOpen && (
                <div className="row-body">
                  <div className="row-tools">
                    <Meta card={card} />
                    <SpeakButton onClick={() => say(card)} />
                  </div>
                  <Details
                    card={card}
                    onSpeak={(t) => language && speak(t, language.tts, settings.ttsRate, settings.voices[language.code])}
                  />
                  <dl className="sched">
                    <div>
                      <dt>Узнавание</dt>
                      <dd>{rec && rec.fsrs.reps ? `через ${formatInterval(new Date(), rec.fsrs.due)}` : 'ещё не учил'}</dd>
                    </div>
                    <div>
                      <dt>Вспоминание</dt>
                      <dd>{cal && cal.fsrs.reps ? `через ${formatInterval(new Date(), cal.fsrs.due)}` : 'ещё не учил'}</dd>
                    </div>
                    <div>
                      <dt>Забывал</dt>
                      <dd>{lapses}</dd>
                    </div>
                    <div>
                      <dt>Колода</dt>
                      <dd>{card.deckName}</dd>
                    </div>
                  </dl>
                  <div className="row-actions">
                    <button className="btn small" onClick={() => toggleSuspend(card.id)}>
                      {suspended.has(card.id) ? 'Снова показывать' : 'Не показывать'}
                    </button>
                    {(rec || cal) && (
                      <button
                        className="btn small ghost"
                        onClick={() => confirm('Сбросить прогресс по этой карточке?') && resetCard(card.id)}
                      >
                        Сбросить прогресс
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {rows.length > limit && (
        <button className="btn ghost wide" onClick={() => setLimit(limit + 100)}>
          Показать ещё
        </button>
      )}
    </div>
  );
}
