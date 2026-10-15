import { createStore, entries, get, set, del, setMany, clear, values } from 'idb-keyval';
import type { LogEntry, Progress, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

// Everything stays on this device. Export/import in settings is the backup.
const progressStore = createStore('lang-cards-progress', 'progress');
const logStore = createStore('lang-cards-log', 'log');
const settingsStore = createStore('lang-cards-settings', 'settings');

export async function loadProgress(): Promise<Map<string, Progress>> {
  const all = await entries<string, Progress>(progressStore);
  return new Map(all);
}

export const saveProgress = (p: Progress) => set(p.key, p, progressStore);
export const deleteProgress = (key: string) => del(key, progressStore);

export const loadLogs = async () => (await values<LogEntry>(logStore)).sort((a, b) => a.t - b.t);
export const saveLog = (l: LogEntry) => set(l.id, l, logStore);
export const deleteLog = (id: string) => del(id, logStore);

export async function loadSettings(): Promise<Settings> {
  const s = await get<Partial<Settings>>('settings', settingsStore);
  return { ...DEFAULT_SETTINGS, ...s };
}
export const saveSettings = (s: Settings) => set('settings', s, settingsStore);

interface Backup {
  app: 'lang-cards';
  version: 1;
  exportedAt: string;
  settings: Settings;
  progress: Progress[];
  logs: LogEntry[];
}

export async function exportBackup(): Promise<Blob> {
  const data: Backup = {
    app: 'lang-cards',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: await loadSettings(),
    progress: [...(await loadProgress()).values()],
    logs: await loadLogs(),
  };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

export async function importBackup(text: string): Promise<number> {
  const data = JSON.parse(text) as Backup;
  if (data.app !== 'lang-cards' || !Array.isArray(data.progress)) {
    throw new Error('Это не файл резервной копии карточек.');
  }
  for (const p of data.progress) {
    p.fsrs.due = new Date(p.fsrs.due);
    if (p.fsrs.last_review) p.fsrs.last_review = new Date(p.fsrs.last_review);
  }
  await clear(progressStore);
  await clear(logStore);
  await setMany(data.progress.map((p) => [p.key, p]), progressStore);
  await setMany((data.logs ?? []).map((l) => [l.id, l]), logStore);
  if (data.settings) await saveSettings({ ...DEFAULT_SETTINGS, ...data.settings });
  return data.progress.length;
}

export async function resetAll() {
  await clear(progressStore);
  await clear(logStore);
}
