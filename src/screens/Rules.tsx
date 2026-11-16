import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Exercise, RuleFile, RuleNode, RuleTree } from '../types';
import { useApp } from '../state';
import { fetchRule } from '../lib/decks';
import { formatInterval } from '../lib/srs';
import { accepted, check, diff } from '../lib/answer';
import type { Verdict } from '../lib/answer';
import { Icon } from '../components/Icon';

interface Section {
  title: string;
  rules: RuleNode[];
}

/** Groups rules under their full path ("A1 · Lekcja 2"), keeping manifest order. */
function sectionsOf(nodes: RuleTree[], path: string[] = [], out: Section[] = []): Section[] {
  const here = nodes.filter((n): n is RuleNode => n.kind === 'rule');
  if (here.length) out.push({ title: path.join(' · ') || 'Общее', rules: here });
  for (const n of nodes) if (n.kind === 'group') sectionsOf(n.children, [...path, n.name], out);
  return out;
}

/** Renders **bold** inside rule text. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

export function Rules() {
  const { language, settings } = useApp();
  const [open, setOpen] = useState<RuleNode>();
  const sections = useMemo(() => sectionsOf(language?.rules ?? []), [language]);

  // Android back button returns to the list instead of leaving the app.
  useEffect(() => {
    if (!open) return;
    history.pushState({ rule: true }, '');
    const onPop = () => setOpen(undefined);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open]);

  const close = () => {
    if (history.state?.rule) history.back();
    else setOpen(undefined);
  };

  if (open) return <RuleView key={open.id} node={open} onBack={close} />;

  return (
    <div className="screen rules">
      <h1>Правила</h1>
      {sections.length === 0 && (
        <p className="empty">Правил пока нет. Они появятся, когда в учебнике встретится грамматика.</p>
      )}
      {sections.map((s) => (
        <section key={s.title} className="rule-section">
          <h2>{s.title}</h2>
          <ul className="card-list">
            {s.rules.map((r) => {
              const score = settings.ruleScores[r.id];
              return (
                <li key={r.id} className="row">
                  <button className="row-main" onClick={() => setOpen(r)}>
                    <span className="row-front">{r.name}</span>
                    {r.summary && <span className="row-back">{r.summary}</span>}
                    {score ? (
                      <span className={`status ${score.right === score.total ? 's-mature' : 's-learning'}`}>
                        {score.right}/{score.total}
                      </span>
                    ) : (
                      <span className="status s-new">{r.count ? `${r.count} зад.` : 'читать'}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function RuleView({ node, onBack }: { node: RuleNode; onBack: () => void }) {
  const { settings } = useApp();
  const [rule, setRule] = useState<RuleFile>();
  const [error, setError] = useState<string>();
  const [practice, setPractice] = useState(false);
  const score = settings.ruleScores[node.id];

  useEffect(() => {
    fetchRule(node).then(setRule, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [node]);

  useEffect(() => window.scrollTo(0, 0), [practice]);

  const exercises = rule?.exercises ?? [];

  return (
    <div className="screen rule-view">
      <header className="rule-top">
        <button className="icon-btn" onClick={practice ? () => setPractice(false) : onBack} aria-label="Назад">
          <Icon name="back" />
        </button>
        <h1>{node.name}</h1>
      </header>
      {error && <p className="empty">{error}</p>}
      {!rule && !error && <p className="empty">Загружаю…</p>}
      {rule && practice && <Practice node={node} exercises={exercises} onClose={() => setPractice(false)} />}
      {rule && !practice && (
        <>
          <article className="panel rule-body">
            {rule.sections.map((s, i) => (
              <RuleBlock key={i} s={s} />
            ))}
          </article>
          {exercises.length > 0 && (
            <div className="rule-practice">
              <button className="btn primary wide" onClick={() => setPractice(true)}>
                Упражнения: {exercises.length}
              </button>
              {score && (
                <p className="f-help">
                  Последний раз: {score.right} из {score.total}, {formatInterval(new Date(score.at), new Date())} назад
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RuleBlock({ s }: { s: RuleFile['sections'][number] }) {
  return (
    <>
      {s.h && <h2>{s.h}</h2>}
      {s.p && (
        <p>
          <Rich text={s.p} />
        </p>
      )}
      {s.list && (
        <ul>
          {s.list.map((li, i) => (
            <li key={i}>
              <Rich text={li} />
            </li>
          ))}
        </ul>
      )}
      {s.table && (
        <div className="rule-table">
          <table>
            {s.table.head && (
              <thead>
                <tr>
                  {s.table.head.map((h, i) => (
                    <th key={i}>
                      <Rich text={h} />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {s.table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>
                      <Rich text={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {s.note && (
        <p className="note">
          <Rich text={s.note} />
        </p>
      )}
    </>
  );
}

function shuffled<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Result {
  ok: boolean;
  verdict: Verdict;
  typed?: string;
  picked?: number;
  target: string;
}

function Practice({ node, exercises, onClose }: { node: RuleNode; exercises: Exercise[]; onClose: () => void }) {
  const { settings, updateSettings, language } = useApp();
  const [round, setRound] = useState(0);
  const items = useMemo(() => shuffled(exercises), [exercises, round]);
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<Result>();
  const [right, setRight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const x = items[i];
  const finished = i >= items.length;

  useEffect(() => {
    if (x && !x.options) setTimeout(() => inputRef.current?.focus(), 50);
  }, [x]);

  useEffect(() => {
    if (!finished) return;
    updateSettings({ ruleScores: { ...settings.ruleScores, [node.id]: { right, total: items.length, at: Date.now() } } });
    // Save once per finished round.
  }, [finished]);

  const settle = (r: Omit<Result, 'ok'>) => {
    const ok = r.verdict === 'correct';
    if (ok) setRight((n) => n + 1);
    setResult({ ...r, ok });
  };

  const submitTyped = () => {
    if (!x || result || !typed.trim()) return;
    const r = check(typed, accepted({ front: x.answers![0], answers: x.answers }));
    const verdict = x.strict && r.verdict === 'almost' ? 'wrong' : r.verdict;
    settle({ verdict, typed, target: r.target });
  };

  const pick = (k: number) => {
    if (!x || result) return;
    settle({ verdict: k === x.answer ? 'correct' : 'wrong', picked: k, target: x.options![x.answer!] });
  };

  const next = () => {
    setI((n) => n + 1);
    setTyped('');
    setResult(undefined);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (result && e.key === 'Enter') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (finished) {
    return (
      <div className="panel practice-done">
        <h2>
          {right} из {items.length}
        </h2>
        <p className="f-help">
          {right === items.length ? 'Без ошибок!' : 'Ошибки — повод перечитать правило и пройти ещё раз.'}
        </p>
        <div className="row-actions">
          <button
            className="btn primary"
            onClick={() => {
              setRound((r) => r + 1);
              setI(0);
              setRight(0);
              setResult(undefined);
              setTyped('');
            }}
          >
            Ещё раз
          </button>
          <button className="btn" onClick={onClose}>
            К правилу
          </button>
        </div>
      </div>
    );
  }

  const lang = language?.code;
  return (
    <div className="practice">
      <div className="progress" aria-label={`Задание ${i + 1} из ${items.length}`}>
        <span style={{ width: `${(i / items.length) * 100}%` }} />
      </div>
      <article className="index-card practice-card">
        <p className="practice-q" lang={lang}>
          <Rich text={x.q} />
        </p>
        {x.hint && <p className="f-help">{x.hint}</p>}

        {x.options ? (
          <div className="options">
            {x.options.map((o, k) => {
              const cls = !result ? '' : k === x.answer ? 'opt-ok' : k === result.picked ? 'opt-bad' : 'opt-dim';
              return (
                <button key={k} className={`btn option ${cls}`} onClick={() => pick(k)} disabled={!!result} lang={lang}>
                  <Rich text={o} />
                </button>
              );
            })}
          </div>
        ) : (
          <form
            className="typebox"
            onSubmit={(e) => {
              e.preventDefault();
              submitTyped();
            }}
          >
            <input
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Ответ"
              readOnly={!!result}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
              lang={lang}
            />
            {!result && language?.chars && (
              <div className="chars">
                {[...language.chars].map((c) => (
                  <button
                    type="button"
                    key={c}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setTyped((t) => t + c);
                      inputRef.current?.focus();
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            {!result && (
              <div className="type-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => settle({ verdict: 'wrong', typed: '', target: x.answers![0] })}
                >
                  Не знаю
                </button>
                <button type="submit" className="btn primary">
                  Проверить
                </button>
              </div>
            )}
          </form>
        )}

        {result && (
          <div className="answer">
            <Feedback result={result} />
            {x.explain && (
              <p className="note">
                <Rich text={x.explain} />
              </p>
            )}
          </div>
        )}
      </article>
      {result && (
        <button className="btn primary wide" onClick={next}>
          {i + 1 < items.length ? 'Дальше' : 'Результат'}
        </button>
      )}
    </div>
  );
}

function Feedback({ result }: { result: Result }): ReactNode {
  const label = result.ok ? 'Верно' : result.verdict === 'almost' ? 'Почти: проверь диакритику' : 'Неверно';
  return (
    <div className={`verdict v-${result.ok ? 'correct' : result.verdict}`}>
      <span className="v-text">{label}</span>
      {!result.ok && (
        <p className="diff">
          {result.typed ? (
            <>
              <span className="typed">{result.typed}</span>
              <span className="arrow" aria-hidden="true">
                ⟶
              </span>
              <span>
                {diff(result.typed, result.target).map((p, k) => (
                  <span key={k} className={p.ok ? 'd-ok' : 'd-miss'}>
                    {p.text}
                  </span>
                ))}
              </span>
            </>
          ) : (
            <span>
              <Rich text={result.target} />
            </span>
          )}
        </p>
      )}
    </div>
  );
}
