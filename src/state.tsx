import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Card, Language, LogEntry, Manifest, Progress, Settings, StudyMode, Track } from './types';
import { DEFAULT_SETTINGS } from './types';
import { fetchCards, fetchManifest } from './lib/decks';
import * as db from './lib/storage';
import { emptyCard, keyOf, scheduler } from './lib/srs';
import type { Grade } from './lib/srs';
import { getVoices, voicesFor } from './lib/tts';

export interface ReviewUndo {
  key: string;
  prev?: Progress;
  logId: string;
  /** When the scheduler wants to see this card again. */
  due: Date;
}

interface AppState {
  ready: boolean;
  error?: string;
  manifest?: Manifest;
  language?: Language;
  cards: Card[];
  progress: Map<string, Progress>;
  logs: LogEntry[];
  settings: Settings;
  voices: SpeechSynthesisVoice[];
  toast?: string;
  setToast: (t?: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  review: (card: Card, track: Track, mode: StudyMode, grade: Grade) => ReviewUndo;
  undo: (u: ReviewUndo) => void;
  resetCard: (cardId: string) => void;
  refresh: (silent?: boolean) => Promise<void>;
  reloadLocal: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [manifest, setManifest] = useState<Manifest>();
  const [cards, setCards] = useState<Card[]>([]);
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map());
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [toast, setToast] = useState<string>();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const knownIds = useRef<Map<string, Set<string>>>(new Map());

  const language = useMemo(() => {
    const langs = manifest?.languages ?? [];
    return langs.find((l) => l.code === settings.lang) ?? langs[0];
  }, [manifest, settings.lang]);

  const loadLanguage = useCallback(async (lang: Language | undefined, announce: boolean) => {
    if (!lang) return setCards([]);
    const next = await fetchCards(lang);
    const before = knownIds.current.get(lang.code);
    const ids = new Set(next.map((c) => c.id));
    if (announce && before) {
      const added = next.filter((c) => !before.has(c.id)).length;
      if (added > 0) setToast(`Добавлено новых карточек: ${added}`);
    }
    knownIds.current.set(lang.code, ids);
    setCards(next);
  }, []);

  const refresh = useCallback(
    async (silent = false) => {
      try {
        const m = await fetchManifest();
        setManifest((old) => (old?.version === m.version ? old : m));
        setError(undefined);
      } catch (e) {
        if (!silent) setError(e instanceof Error ? e.message : String(e));
      }
    },
    [],
  );

  const reloadLocal = useCallback(async () => {
    const [p, l, s] = await Promise.all([db.loadProgress(), db.loadLogs(), db.loadSettings()]);
    setProgress(p);
    setLogs(l);
    setSettings(s);
  }, []);

  // Boot: local state first, then the network.
  useEffect(() => {
    (async () => {
      await reloadLocal();
      await refresh();
      setReady(true);
      navigator.storage?.persist?.().catch(() => {});
    })();
  }, [reloadLocal, refresh]);

  // Whenever the manifest or language changes, (re)load that language's cards.
  useEffect(() => {
    if (!language) return;
    loadLanguage(language, true).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [language, loadLanguage]);

  // Pick up new cards when the app comes back to the foreground.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && refresh(true);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    getVoices().then(setVoices);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    db.saveSettings(next);
  }, []);

  const review = useCallback(
    (card: Card, track: Track, mode: StudyMode, grade: Grade): ReviewUndo => {
      const now = new Date();
      const key = keyOf(card.id, track);
      const prev = progressRef.current.get(key);
      const rec = scheduler(settingsRef.current.retention).next(prev?.fsrs ?? emptyCard(now), now, grade);
      const next: Progress = { key, cardId: card.id, track, fsrs: rec.card };
      const log: LogEntry = {
        id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
        t: now.getTime(),
        lang: card.lang,
        cardId: card.id,
        track,
        mode,
        rating: grade,
        prevState: prev?.fsrs.state ?? 0,
      };
      progressRef.current = new Map(progressRef.current).set(key, next);
      setProgress(progressRef.current);
      setLogs((l) => [...l, log]);
      db.saveProgress(next);
      db.saveLog(log);
      return { key, prev, logId: log.id, due: rec.card.due };
    },
    [],
  );

  const undo = useCallback((u: ReviewUndo) => {
    setProgress((m) => {
      const n = new Map(m);
      if (u.prev) n.set(u.key, u.prev);
      else n.delete(u.key);
      return n;
    });
    setLogs((l) => l.filter((x) => x.id !== u.logId));
    if (u.prev) db.saveProgress(u.prev);
    else db.deleteProgress(u.key);
    db.deleteLog(u.logId);
  }, []);

  const resetCard = useCallback((cardId: string) => {
    const keys = [keyOf(cardId, 'recognize'), keyOf(cardId, 'recall')];
    setProgress((m) => {
      const n = new Map(m);
      keys.forEach((k) => n.delete(k));
      return n;
    });
    keys.forEach((k) => db.deleteProgress(k));
  }, []);

  const value: AppState = {
    ready,
    error,
    manifest,
    language,
    cards,
    progress,
    logs,
    settings,
    voices,
    toast,
    setToast,
    updateSettings,
    review,
    undo,
    resetCard,
    refresh,
    reloadLocal,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Whether the audio mode can work for this language on this device. */
export function useAudioAvailable() {
  const { voices, language } = useApp();
  if (!language || typeof window === 'undefined' || !window.speechSynthesis) return false;
  // Some Android builds report no voices until first use; assume they exist in that case.
  return voices.length === 0 || voicesFor(voices, language.tts).length > 0;
}

/** Cards of the current language limited to the decks selected on the home screen. */
export function useScopedCards() {
  const { cards, settings, language } = useApp();
  return useMemo(() => {
    const scope = language ? settings.scope[language.code] : undefined;
    if (!scope?.length) return cards;
    if (scope.includes('__none__')) return [];
    const set = new Set(scope);
    const picked = cards.filter((c) => set.has(c.deckId));
    // A selection that points only at removed decks falls back to everything.
    return picked.length ? picked : cards;
  }, [cards, settings.scope, language]);
}
