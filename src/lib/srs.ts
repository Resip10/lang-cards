import { createEmptyCard, fsrs, generatorParameters, Rating, State } from 'ts-fsrs';
import type { Card as FsrsCard, FSRS, Grade } from 'ts-fsrs';
import type { Card, LogEntry, Mode, Progress, Settings, StudyMode, Track } from '../types';

export { Rating, State };
export type { Grade };

const schedulers = new Map<number, FSRS>();
export function scheduler(retention: number): FSRS {
  let s = schedulers.get(retention);
  if (!s) {
    s = fsrs(generatorParameters({ request_retention: retention, enable_fuzz: true, enable_short_term: true }));
    schedulers.set(retention, s);
  }
  return s;
}

export const keyOf = (cardId: string, track: Track) => `${cardId}|${track}`;
export const trackOf = (m: StudyMode): Track => (m === 'forward' || m === 'audio' ? 'recognize' : 'recall');
export const emptyCard = (now = new Date()) => createEmptyCard(now);

export const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Long-term cards are "due" for the whole calendar day; learning steps only once their time comes. */
export function isDue(c: FsrsCard, now: Date) {
  if (c.state === State.Learning || c.state === State.Relearning) {
    return c.due.getTime() <= now.getTime() + 20 * 60_000;
  }
  return c.due.getTime() <= endOfDay(now).getTime();
}

export function previewIntervals(fc: FsrsCard | undefined, retention: number, now: Date) {
  const preview = scheduler(retention).repeat(fc ?? emptyCard(now), now);
  const out = {} as Record<Grade, string>;
  for (const g of GRADES) out[g] = formatInterval(now, preview[g].card.due);
  return out;
}

export function formatInterval(from: Date, to: Date): string {
  const min = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
  if (min < 1) return '<1 мин';
  if (min < 60) return `${min} мин`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ч`;
  const d = Math.round(min / 1440);
  if (d < 31) return `${d} дн`;
  const m = d / 30.4;
  if (m < 12) return `${m < 10 ? m.toFixed(1).replace('.0', '').replace('.', ',') : Math.round(m)} мес`;
  const y = d / 365;
  return `${y.toFixed(1).replace('.0', '').replace('.', ',')} г`;
}

export type CardStatus = 'new' | 'learning' | 'young' | 'mature' | 'suspended';

export const STATUS_LABEL: Record<CardStatus, string> = {
  new: 'новая',
  learning: 'учу',
  young: 'повторяю',
  mature: 'знаю',
  suspended: 'пропускаю',
};

export function statusOf(p: Progress | undefined, suspended = false): CardStatus {
  if (suspended) return 'suspended';
  if (!p || p.fsrs.state === State.New) return 'new';
  if (p.fsrs.state !== State.Review) return 'learning';
  return p.fsrs.stability >= 21 ? 'mature' : 'young';
}

export interface QueueItem {
  card: Card;
  track: Track;
  mode: StudyMode;
  isNew: boolean;
}

export function newIntroducedToday(logs: LogEntry[], lang: string, now = new Date()) {
  const from = startOfDay(now).getTime();
  const seen = new Set<string>();
  for (let i = logs.length - 1; i >= 0 && logs[i].t >= from; i--) {
    const l = logs[i];
    if (l.lang === lang && l.prevState === State.New && l.track === 'recognize') seen.add(l.cardId);
  }
  return seen.size;
}

function shuffle<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pickMode(track: Track, mode: Mode, audio: boolean): StudyMode {
  if (mode !== 'mix') return mode;
  if (track === 'recognize') return audio && Math.random() < 0.25 ? 'audio' : 'forward';
  return Math.random() < 0.5 ? 'typing' : 'backward';
}

export interface QueueCounts {
  due: number;
  fresh: number;
  freshAvailable: number;
}

/**
 * Builds today's queue: everything due, plus new cards up to the daily budget.
 * In mix mode a card is first learned for recognition; its recall side unlocks
 * after the first recognition review.
 */
export function buildQueue(opts: {
  cards: Card[];
  progress: Map<string, Progress>;
  settings: Settings;
  mode: Mode;
  newBudget: number;
  audio: boolean;
  now?: Date;
}): { items: QueueItem[]; counts: QueueCounts } {
  const { cards, progress, settings, mode, newBudget, audio } = opts;
  const now = opts.now ?? new Date();
  const suspended = new Set(settings.suspended);
  const tracks: Track[] = mode === 'mix' ? ['recognize', 'recall'] : [trackOf(mode)];

  const due: { item: QueueItem; at: number }[] = [];
  const fresh: QueueItem[] = [];
  const unlocked: QueueItem[] = [];

  for (const card of cards) {
    if (suspended.has(card.id)) continue;
    for (const track of tracks) {
      const p = progress.get(keyOf(card.id, track));
      const make = (isNew: boolean): QueueItem => ({ card, track, isNew, mode: pickMode(track, mode, audio) });
      if (p && p.fsrs.state !== State.New) {
        if (isDue(p.fsrs, now)) due.push({ item: make(false), at: p.fsrs.due.getTime() });
        continue;
      }
      if (mode === 'mix' && track === 'recall') {
        const rec = progress.get(keyOf(card.id, 'recognize'));
        if (rec && rec.fsrs.state !== State.New) unlocked.push(make(true));
      } else {
        fresh.push(make(true));
      }
    }
  }

  fresh.sort((a, b) => a.card.order - b.card.order);
  const freshToday = fresh.slice(0, Math.max(0, newBudget));
  const unlockedToday = unlocked.sort((a, b) => a.card.order - b.card.order).slice(0, settings.newPerDay);

  // Learning steps first (they are time-sensitive), the rest shuffled so order isn't memorised.
  const learning = due.filter((d) => d.at <= now.getTime()).sort((a, b) => a.at - b.at).map((d) => d.item);
  const rest = shuffle(due.filter((d) => d.at > now.getTime()).map((d) => d.item));
  const reviews = [...learning, ...shuffle([...rest, ...unlockedToday])];

  // One new card after every three reviews keeps sessions from front-loading unknown words.
  const items: QueueItem[] = [];
  let r = 0;
  let n = 0;
  while (r < reviews.length || n < freshToday.length) {
    for (let k = 0; k < 3 && r < reviews.length; k++) items.push(reviews[r++]);
    if (n < freshToday.length) items.push(freshToday[n++]);
  }

  return {
    items,
    counts: { due: due.length + unlockedToday.length, fresh: freshToday.length, freshAvailable: fresh.length },
  };
}

export function streak(logs: LogEntry[], now = new Date()) {
  const days = new Set(logs.map((l) => startOfDay(new Date(l.t)).getTime()));
  let d = startOfDay(now);
  if (!days.has(d.getTime())) d = new Date(d.getTime() - 86_400_000);
  let count = 0;
  while (days.has(d.getTime())) {
    count++;
    d = startOfDay(new Date(d.getTime() - 12 * 3_600_000));
  }
  return count;
}
