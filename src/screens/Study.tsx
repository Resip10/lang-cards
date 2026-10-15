import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Card } from '../types';
import { useApp } from '../state';
import type { ReviewUndo } from '../state';
import { GRADES, keyOf, previewIntervals, Rating } from '../lib/srs';
import type { Grade, QueueItem } from '../lib/srs';
import { accepted, check, diff } from '../lib/answer';
import type { Verdict } from '../lib/answer';
import { speak, stopSpeaking } from '../lib/tts';
import { Details, Meta, SpeakButton } from '../components/CardFace';
import { Icon } from '../components/Icon';

const LEARN_AHEAD = 20 * 60_000;

const GRADE_LABEL: Record<Grade, string> = {
  [Rating.Again]: 'Снова',
  [Rating.Hard]: 'Трудно',
  [Rating.Good]: 'Хорошо',
  [Rating.Easy]: 'Легко',
};
const GRADE_CLASS: Record<Grade, string> = {
  [Rating.Again]: 'again',
  [Rating.Hard]: 'hard',
  [Rating.Good]: 'good',
  [Rating.Easy]: 'easy',
};
const VERDICT_GRADE: Record<Verdict, Grade> = { correct: Rating.Good, almost: Rating.Hard, wrong: Rating.Again };

interface Pending {
  item: QueueItem;
  at: number;
}

interface Snapshot {
  queue: QueueItem[];
  pending: Pending[];
  current: QueueItem;
  done: number;
  right: number;
  undo: ReviewUndo;
}

export function Study({ items, onExit, onMore }: { items: QueueItem[]; onExit: () => void; onMore: () => QueueItem[] }) {
  const { review, undo, progress, settings, language } = useApp();
  const [queue, setQueue] = useState<QueueItem[]>(() => items.slice(1));
  const [pending, setPending] = useState<Pending[]>([]);
  const [current, setCurrent] = useState<QueueItem | undefined>(items[0]);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<{ verdict: Verdict; target: string; typed: string }>();
  const [done, setDone] = useState(0);
  const [right, setRight] = useState(0);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const tts = language?.tts ?? 'pl-PL';
  const voice = language ? settings.voices[language.code] : undefined;
  const say = useCallback((t: string) => speak(t, tts, settings.ttsRate, voice), [tts, settings.ttsRate, voice]);
  const sayCard = useCallback((c: Card) => say(c.audio ?? c.front), [say]);

  const typing = current?.mode === 'typing' || current?.mode === 'audio';

  // Speak on show (forward/audio) or on reveal (backward/typing).
  useEffect(() => {
    if (!current) return;
    const m = current.mode;
    if (m === 'audio') sayCard(current.card);
    else if (settings.autoplay && m === 'forward') sayCard(current.card);
    if (m === 'typing' || m === 'audio') setTimeout(() => inputRef.current?.focus(), 50);
    return () => stopSpeaking();
  }, [current, settings.autoplay, sayCard]);

  useEffect(() => {
    if (revealed && current && settings.autoplay && (current.mode === 'backward' || current.mode === 'typing')) {
      sayCard(current.card);
    }
  }, [revealed, current, settings.autoplay, sayCard]);

  const intervals = useMemo(() => {
    if (!current) return undefined;
    const p = progress.get(keyOf(current.card.id, current.track));
    return previewIntervals(p?.fsrs, settings.retention, new Date());
  }, [current, progress, settings.retention]);

  const advance = (q: QueueItem[], pend: Pending[]) => {
    const now = Date.now();
    const ready = pend.filter((p) => p.at <= now).sort((a, b) => a.at - b.at)[0];
    let next: QueueItem | undefined;
    if (ready) {
      next = ready.item;
      pend = pend.filter((p) => p !== ready);
    } else if (q.length) {
      next = q[0];
      q = q.slice(1);
    } else if (pend.length) {
      const soonest = [...pend].sort((a, b) => a.at - b.at)[0];
      next = soonest.item;
      pend = pend.filter((p) => p !== soonest);
    }
    setQueue(q);
    setPending(pend);
    setCurrent(next);
    setRevealed(false);
    setTyped('');
    setResult(undefined);
  };

  const rate = (grade: Grade) => {
    if (!current) return;
    const u = review(current.card, current.track, current.mode, grade);
    setHistory((h) => [...h.slice(-19), { queue, pending, current, done, right, undo: u }]);
    setDone((d) => d + 1);
    if (grade > Rating.Again) setRight((r) => r + 1);

    // Short learning steps come back within this session.
    const at = u.due.getTime();
    const pend = at - Date.now() < LEARN_AHEAD ? [...pending, { item: { ...current, isNew: false }, at }] : pending;
    advance(queue, pend);
  };

  const undoLast = () => {
    const last = history[history.length - 1];
    if (!last) return;
    undo(last.undo);
    setHistory((h) => h.slice(0, -1));
    setQueue(last.queue);
    setPending(last.pending);
    setCurrent(last.current);
    setDone(last.done);
    setRight(last.right);
    setRevealed(false);
    setTyped('');
    setResult(undefined);
  };

  const submit = () => {
    if (!current) return;
    const r = check(typed, accepted(current.card));
    setResult({ ...r, typed });
    setRevealed(true);
  };

  const giveUp = () => {
    if (!current) return;
    setResult({ verdict: 'wrong', target: accepted(current.card)[0], typed: '' });
    setRevealed(true);
  };

  const suggested: Grade | undefined = result ? VERDICT_GRADE[result.verdict] : undefined;

  // Keyboard: space/enter reveals, 1–4 rate, enter accepts the suggestion after typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current) return;
      const inInput = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (!revealed) {
        if (!typing && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault();
          setRevealed(true);
        }
        return;
      }
      if (e.key === 'Enter' && suggested) {
        e.preventDefault();
        rate(suggested);
      } else if (!inInput && ['1', '2', '3', '4'].includes(e.key)) {
        rate(Number(e.key) as Grade);
      } else if (!inInput && e.key === ' ' && !typing) {
        e.preventDefault();
        rate(Rating.Good);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const remaining = queue.length + pending.length + (current ? 1 : 0);
  const total = done + remaining;

  if (!current) {
    const more = onMore();
    return (
      <div className="study done-screen">
        <div className="done-card">
          <h1>На сегодня готово</h1>
          {done > 0 ? (
            <p>
              Повторено карточек: {done}. Вспомнил с первого раза: {Math.round((right / done) * 100)}%.
            </p>
          ) : (
            <p>Повторять сейчас нечего.</p>
          )}
          {more.length > 0 && (
            <button
              className="btn primary"
              onClick={() => {
                setQueue(more.slice(1));
                setCurrent(more[0]);
                setPending([]);
              }}
            >
              Учить ещё {more.length} новых
            </button>
          )}
          <button className="btn" onClick={onExit}>
            На главную
          </button>
        </div>
      </div>
    );
  }

  const { card, mode } = current;
  const showFront = mode === 'forward';
  const code = language?.code.toUpperCase() ?? '';
  const modeLabel = {
    forward: `${code} → RU`,
    backward: `RU → ${code}`,
    typing: `RU → ${code}, ввод`,
    audio: 'Напиши, что услышал',
  }[mode];

  return (
    <div className="study">
      <header className="study-top">
        <button className="icon-btn" onClick={onExit} aria-label="Закончить">
          <Icon name="close" />
        </button>
        <div className="progress" aria-label={`Пройдено ${done} из ${total}`}>
          <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
        <span className="remaining">{remaining}</span>
        <button className="icon-btn" onClick={undoLast} disabled={!history.length} aria-label="Отменить оценку">
          <Icon name="undo" />
        </button>
      </header>

      <Swipe enabled={revealed && !typing} onLeft={() => rate(Rating.Again)} onRight={() => rate(Rating.Good)}>
        <article className={`index-card ${revealed ? 'revealed' : ''}`} key={`${card.id}-${current.track}-${done}`}>
          <div className="card-head">
            <span className="mode-tag">{modeLabel}</span>
            {current.isNew && <span className="new-tag">новая</span>}
            <span className="deck-tag">{card.deckName}</span>
          </div>

          <div className="prompt">
            {mode === 'audio' && !revealed ? (
              <button className="big-play" onClick={() => sayCard(card)} aria-label="Прослушать ещё раз">
                <Icon name="speaker" size={40} />
              </button>
            ) : showFront || (revealed && mode === 'audio') ? (
              <>
                <h2 className="term" lang={card.lang}>
                  {card.front}
                </h2>
                <SpeakButton onClick={() => sayCard(card)} />
              </>
            ) : (
              <h2 className="term native">{card.back}</h2>
            )}
            <Meta card={card} />
            {!revealed && mode !== 'forward' && mode !== 'audio' && card.image && (
              <img className="card-img" src={`/media/${card.image}`} alt="" />
            )}
          </div>

          {typing && !revealed && (
            <TypeBox
              ref={inputRef}
              value={typed}
              onChange={setTyped}
              onSubmit={submit}
              onGiveUp={giveUp}
              chars={language?.chars ?? ''}
              pair={accepted(card)[0].includes('/')}
            />
          )}

          {revealed && (
            <div className="answer">
              {result && <Verdict result={result} />}
              {mode === 'forward' || mode === 'audio' ? (
                <p className="translation">{card.back}</p>
              ) : (
                <div className="answer-term">
                  <span className="term" lang={card.lang}>
                    {card.front}
                  </span>
                  <SpeakButton onClick={() => sayCard(card)} />
                </div>
              )}
              <Details card={card} onSpeak={say} />
            </div>
          )}
        </article>
      </Swipe>

      <footer className="study-actions">
        {!revealed ? (
          !typing && (
            <button className="btn primary wide" onClick={() => setRevealed(true)}>
              Показать ответ
            </button>
          )
        ) : (
          <div className="grades" role="group" aria-label="Насколько легко вспомнил">
            {GRADES.map((g) => (
              <button
                key={g}
                className={`grade ${GRADE_CLASS[g]} ${suggested === g ? 'suggested' : ''}`}
                onClick={() => rate(g)}
              >
                <span className="g-label">{GRADE_LABEL[g]}</span>
                <span className="g-int">{intervals?.[g]}</span>
              </button>
            ))}
          </div>
        )}
        {revealed && !typing && <p className="swipe-tip">Свайп влево — снова, вправо — хорошо</p>}
      </footer>
    </div>
  );
}

function Verdict({ result }: { result: { verdict: Verdict; target: string; typed: string } }) {
  const text = { correct: 'Верно', almost: 'Почти: проверь диакритику', wrong: result.typed ? 'Неверно' : 'Ответ' }[
    result.verdict
  ];
  return (
    <div className={`verdict v-${result.verdict}`}>
      <span className="v-text">{text}</span>
      {result.typed && result.verdict !== 'correct' && (
        <p className="diff">
          <span className="typed">{result.typed}</span>
          <span className="arrow" aria-hidden="true">
            ⟶
          </span>
          <span>
            {diff(result.typed, result.target).map((p, i) => (
              <span key={i} className={p.ok ? 'd-ok' : 'd-miss'}>
                {p.text}
              </span>
            ))}
          </span>
        </p>
      )}
    </div>
  );
}

const TypeBox = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    onGiveUp: () => void;
    chars: string;
    pair: boolean;
  }
>(function TypeBox({ value, onChange, onSubmit, onGiveUp, chars, pair }, ref) {
  const local = useRef<HTMLInputElement | null>(null);
  const insert = (ch: string) => {
    const el = local.current;
    if (!el) return onChange(value + ch);
    const s = el.selectionStart ?? value.length;
    const e = el.selectionEnd ?? value.length;
    const next = value.slice(0, s) + ch + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + ch.length, s + ch.length);
    });
  };
  return (
    <form
      className="typebox"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <input
        ref={(el) => {
          local.current = el;
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={pair ? 'обе формы через /' : 'Ответ'}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
      />
      {chars && (
        <div className="chars">
          {[...chars].map((c) => (
            <button type="button" key={c} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="type-actions">
        <button type="button" className="btn" onClick={onGiveUp}>
          Не знаю
        </button>
        <button type="submit" className="btn primary">
          Проверить
        </button>
      </div>
    </form>
  );
});

function Swipe({
  enabled,
  onLeft,
  onRight,
  children,
}: {
  enabled: boolean;
  onLeft: () => void;
  onRight: () => void;
  children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const reset = () => {
    start.current = null;
    setDx(0);
  };
  return (
    <div
      className="swipe"
      style={enabled && dx ? { transform: `translateX(${dx}px) rotate(${dx / 30}deg)` } : undefined}
      data-swipe={dx > 60 ? 'right' : dx < -60 ? 'left' : undefined}
      onPointerDown={(e) => {
        if (!enabled || e.pointerType === 'mouse') return;
        const target = e.target as HTMLElement;
        if (target.closest('button, input, a')) return;
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      }}
      onPointerMove={(e) => {
        if (!start.current || e.pointerId !== start.current.id) return;
        const x = e.clientX - start.current.x;
        const y = e.clientY - start.current.y;
        if (Math.abs(y) > Math.abs(x) && Math.abs(x) < 20) return;
        setDx(x);
      }}
      onPointerUp={() => {
        if (!start.current) return;
        const d = dx;
        reset();
        if (d > 90) onRight();
        else if (d < -90) onLeft();
      }}
      onPointerCancel={reset}
    >
      {children}
    </div>
  );
}
