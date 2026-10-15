import { useMemo } from 'react';
import type { Mode } from '../types';
import { useApp, useAudioAvailable, useScopedCards } from '../state';
import { buildQueue, newIntroducedToday, streak } from '../lib/srs';
import type { QueueItem } from '../lib/srs';
import { DeckTree } from '../components/DeckTree';

export function useQueue(mode: Mode, extraNew = 0) {
  const { progress, settings, logs, language } = useApp();
  const cards = useScopedCards();
  const audio = useAudioAvailable();
  return () => {
    const used = language ? newIntroducedToday(logs, language.code) : 0;
    return buildQueue({
      cards,
      progress,
      settings,
      mode: mode === 'audio' && !audio ? 'forward' : mode,
      newBudget: settings.newPerDay - used + extraNew,
      audio,
    });
  };
}

export function Home({ onStart }: { onStart: (items: QueueItem[]) => void }) {
  const { language, manifest, settings, updateSettings, progress, logs, cards } = useApp();
  const audio = useAudioAvailable();
  const mode = settings.mode;
  const make = useQueue(mode);
  const makeMore = useQueue(mode, 10);
  const { counts } = make();
  const days = useMemo(() => streak(logs.filter((l) => l.lang === language?.code)), [logs, language]);

  if (!language) return null;
  const code = language.code.toUpperCase();
  const total = counts.due + counts.fresh;

  const MODES: { id: Mode; label: string; hint: string }[] = [
    { id: 'mix', label: 'Микс', hint: 'Все режимы вперемешку. Новое слово сначала учишь узнавать, потом вспоминать.' },
    { id: 'forward', label: `${code} → RU`, hint: 'Видишь слово, вспоминаешь перевод.' },
    { id: 'backward', label: `RU → ${code}`, hint: 'Видишь перевод, вспоминаешь слово.' },
    { id: 'typing', label: 'Ввод', hint: 'Видишь перевод и пишешь слово. Ошибки в диакритике засчитываются как «трудно».' },
    {
      id: 'audio',
      label: 'На слух',
      hint: audio
        ? 'Слушаешь слово и записываешь его.'
        : 'На этом устройстве нет голоса для этого языка, поэтому вместо аудио будут обычные карточки.',
    },
  ];

  return (
    <div className="screen home">
      <header className="home-head">
        {manifest && manifest.languages.length > 1 ? (
          <div className="lang-switch" role="tablist" aria-label="Язык">
            {manifest.languages.map((l) => (
              <button
                key={l.code}
                role="tab"
                aria-selected={l.code === language.code}
                className={l.code === language.code ? 'on' : ''}
                onClick={() => updateSettings({ lang: l.code })}
              >
                <span aria-hidden="true">{l.flag}</span> {l.name}
              </button>
            ))}
          </div>
        ) : (
          <h1 className="lang-title">
            <span aria-hidden="true">{language.flag}</span> {language.name}
          </h1>
        )}
      </header>

      <section className="today" aria-label="Сегодня">
        <div className="figure">
          <strong>{counts.due}</strong>
          <span>к повторению</span>
        </div>
        <div className="figure">
          <strong>{counts.fresh}</strong>
          <span>новых</span>
        </div>
        <div className="figure">
          <strong>{days}</strong>
          <span>{plural(days, 'день', 'дня', 'дней')} подряд</span>
        </div>
      </section>

      <section className="modes" aria-label="Режим">
        <div className="segmented" role="radiogroup">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={mode === m.id}
              className={mode === m.id ? 'on' : ''}
              onClick={() => updateSettings({ mode: m.id })}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mode-hint">{MODES.find((m) => m.id === mode)?.hint}</p>
      </section>

      <button className="btn primary start" disabled={total === 0} onClick={() => onStart(make().items)}>
        {total > 0 ? `Начать: ${total} ${plural(total, 'карточка', 'карточки', 'карточек')}` : 'На сегодня всё повторено'}
      </button>
      {total === 0 && counts.freshAvailable > 0 && (
        <button className="btn ghost more" onClick={() => onStart(makeMore().items)}>
          Учить ещё {Math.min(10, counts.freshAvailable)} новых сверх лимита
        </button>
      )}

      <section className="decks">
        <h2>Колоды</h2>
        <DeckTree
          language={language}
          cards={cards}
          progress={progress}
          suspended={settings.suspended}
          scope={settings.scope[language.code]}
          onScope={(ids) => updateSettings({ scope: { ...settings.scope, [language.code]: ids } })}
        />
      </section>
    </div>
  );
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
