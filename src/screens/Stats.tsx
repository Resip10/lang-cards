import { useMemo } from 'react';
import { useApp } from '../state';
import { endOfDay, keyOf, Rating, startOfDay, State, statusOf, streak } from '../lib/srs';
import type { CardStatus } from '../lib/srs';
import { plural } from './Home';

const DAY = 86_400_000;
const WEEKDAY = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export function Stats() {
  const { logs, cards, progress, language, settings } = useApp();
  const code = language?.code;

  const data = useMemo(() => {
    const mine = logs.filter((l) => l.lang === code);
    const today = startOfDay().getTime();

    const perDay = Array.from({ length: 30 }, (_, i) => {
      const from = today - (29 - i) * DAY;
      const day = mine.filter((l) => l.t >= from && l.t < from + DAY);
      return { from, total: day.length, fails: day.filter((l) => l.rating === Rating.Again).length };
    });

    const monthAgo = today - 29 * DAY;
    const matured = mine.filter((l) => l.t >= monthAgo && l.prevState === State.Review);
    const retention = matured.length
      ? Math.round((matured.filter((l) => l.rating > Rating.Again).length / matured.length) * 100)
      : undefined;

    const suspended = new Set(settings.suspended);
    const status: Record<CardStatus, number> = { new: 0, learning: 0, young: 0, mature: 0, suspended: 0 };
    for (const c of cards) status[statusOf(progress.get(keyOf(c.id, 'recognize')), suspended.has(c.id))]++;

    const forecast = Array.from({ length: 7 }, (_, i) => {
      const end = endOfDay(new Date(today + i * DAY)).getTime();
      const start = i === 0 ? 0 : startOfDay(new Date(today + i * DAY)).getTime();
      let n = 0;
      for (const c of cards) {
        if (suspended.has(c.id)) continue;
        for (const t of ['recognize', 'recall'] as const) {
          const p = progress.get(keyOf(c.id, t));
          if (!p || p.fsrs.state === State.New) continue;
          const due = p.fsrs.due.getTime();
          if (due >= start && due <= end) n++;
        }
      }
      return { day: i === 0 ? 'сегодня' : i === 1 ? 'завтра' : WEEKDAY[new Date(today + i * DAY).getDay()], n };
    });

    return {
      perDay,
      retention,
      status,
      forecast,
      todayCount: perDay[29].total,
      monthCount: perDay.reduce((a, d) => a + d.total, 0),
      streak: streak(mine),
    };
  }, [logs, code, cards, progress, settings.suspended]);

  const maxDay = Math.max(1, ...data.perDay.map((d) => d.total));
  const maxFc = Math.max(1, ...data.forecast.map((d) => d.n));
  const known = cards.length - data.status.new - data.status.suspended;

  return (
    <div className="screen stats">
      <h1>Статистика</h1>

      <section className="today">
        <div className="figure">
          <strong>{data.todayCount}</strong>
          <span>сегодня</span>
        </div>
        <div className="figure">
          <strong>{data.retention !== undefined ? `${data.retention}%` : '—'}</strong>
          <span>вспоминаю</span>
        </div>
        <div className="figure">
          <strong>{data.streak}</strong>
          <span>{plural(data.streak, 'день', 'дня', 'дней')} подряд</span>
        </div>
      </section>
      <p className="explain">
        «Вспоминаю» — доля выученных карточек, которые ты вспомнил за последние 30 дней. Цель в настройках:{' '}
        {Math.round(settings.retention * 100)}%.
      </p>

      <section className="panel">
        <h2>Повторения за 30 дней</h2>
        <div className="bars" role="img" aria-label={`Всего ${data.monthCount} повторений за 30 дней`}>
          {data.perDay.map((d) => (
            <div key={d.from} className="bar" title={`${new Date(d.from).toLocaleDateString('ru')}: ${d.total}`}>
              <span className="ok" style={{ height: `${((d.total - d.fails) / maxDay) * 100}%` }} />
              <span className="fail" style={{ height: `${(d.fails / maxDay) * 100}%` }} />
            </div>
          ))}
        </div>
        <p className="legend">
          <span className="key ok" /> вспомнил <span className="key fail" /> забыл
          <span className="sum">всего {data.monthCount}</span>
        </p>
      </section>

      <section className="panel">
        <h2>Слова</h2>
        <div className="stack" role="img" aria-label="Распределение карточек">
          {(['mature', 'young', 'learning', 'new'] as CardStatus[]).map((s) =>
            data.status[s] ? (
              <span key={s} className={`seg s-${s}`} style={{ flexGrow: data.status[s] }} />
            ) : null,
          )}
        </div>
        <ul className="stack-legend">
          <li>
            <span className="key s-mature" /> знаю <b>{data.status.mature}</b>
          </li>
          <li>
            <span className="key s-young" /> повторяю <b>{data.status.young}</b>
          </li>
          <li>
            <span className="key s-learning" /> учу <b>{data.status.learning}</b>
          </li>
          <li>
            <span className="key s-new" /> новые <b>{data.status.new}</b>
          </li>
        </ul>
        <p className="explain">
          Начато {known} из {cards.length}. «Знаю» — интервал повторения больше трёх недель.
        </p>
      </section>

      <section className="panel">
        <h2>Ближайшие 7 дней</h2>
        <ul className="forecast">
          {data.forecast.map((d) => (
            <li key={d.day}>
              <span className="fc-day">{d.day}</span>
              <span className="fc-bar">
                <span style={{ width: `${(d.n / maxFc) * 100}%` }} />
              </span>
              <span className="fc-n">{d.n}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
