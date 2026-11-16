import type { Card as FsrsCard, State } from 'ts-fsrs';

export type Gender = 'm' | 'f' | 'n' | 'pl';

/** One card as written in a deck JSON file. */
export interface CardData {
  id: string;
  /** Word or phrase in the language being learned. */
  front: string;
  /** Translation into Russian. */
  back: string;
  /** Short grammar note shown on both sides (e.g. "ndk / dk"). */
  hint?: string;
  gender?: Gender;
  example?: string;
  exampleTr?: string;
  note?: string;
  tags?: string[];
  /** Path under /media, e.g. "pl/kot.jpg". */
  image?: string;
  /** Accepted typed answers. Defaults to `front`. */
  answers?: string[];
  /** Text to speak instead of `front`. */
  audio?: string;
}

export interface DeckFile {
  name?: string;
  order?: number;
  cards: CardData[];
}

export interface DeckNode {
  kind: 'deck';
  id: string;
  file: string;
  name: string;
  count: number;
  hash: string;
  order?: number;
}

export interface GroupNode {
  kind: 'group';
  id: string;
  name: string;
  order?: number;
  children: TreeNode[];
}

export type TreeNode = DeckNode | GroupNode;

/** A grammar rule page: explanation plus a few exercises. Lives next to decks as *.rule.json. */
export interface RuleNode {
  kind: 'rule';
  id: string;
  file: string;
  name: string;
  summary?: string;
  count: number;
  hash: string;
  order?: number;
}

export interface RuleGroup {
  kind: 'group';
  id: string;
  name: string;
  order?: number;
  children: RuleTree[];
}

export type RuleTree = RuleNode | RuleGroup;

/** One block of a rule's explanation. Strings may use **bold**. */
export interface RuleSection {
  h?: string;
  p?: string;
  list?: string[];
  table?: { head?: string[]; rows: string[][] };
  note?: string;
}

/** Either typed (`answers`) or multiple choice (`options` + `answer` index). */
export interface Exercise {
  q: string;
  /** Translation or instruction shown under the question. */
  hint?: string;
  answers?: string[];
  options?: string[];
  answer?: number;
  /** Diacritic slips count as wrong (spelling exercises). */
  strict?: boolean;
  explain?: string;
}

export interface RuleFile {
  name: string;
  summary?: string;
  sections: RuleSection[];
  exercises?: Exercise[];
}

export interface RuleScore {
  right: number;
  total: number;
  at: number;
}

export interface Language {
  code: string;
  name: string;
  flag: string;
  tts: string;
  chars: string;
  total: number;
  tree: TreeNode[];
  rules?: RuleTree[];
}

export interface Manifest {
  version: string;
  languages: Language[];
}

/** A card enriched with where it came from. */
export interface Card extends CardData {
  lang: string;
  deckId: string;
  deckName: string;
  /** Position across the whole language, used to introduce new cards in deck order. */
  order: number;
}

/** Recognition (foreign → native) and recall (native → foreign) are scheduled separately. */
export type Track = 'recognize' | 'recall';

export type StudyMode = 'forward' | 'backward' | 'typing' | 'audio';
export type Mode = 'mix' | StudyMode;

export interface Progress {
  key: string;
  cardId: string;
  track: Track;
  fsrs: FsrsCard;
}

export interface LogEntry {
  id: string;
  t: number;
  lang: string;
  cardId: string;
  track: Track;
  mode: StudyMode;
  rating: number;
  prevState: State;
}

export interface Settings {
  lang?: string;
  mode: Mode;
  newPerDay: number;
  retention: number;
  ttsRate: number;
  autoplay: boolean;
  theme: 'system' | 'light' | 'dark';
  /** Selected deck ids per language; empty or missing means all decks. */
  scope: Record<string, string[]>;
  /** Preferred voice URI per language code. */
  voices: Record<string, string>;
  /** Card ids hidden for good ("skip forever"); restorable in settings. */
  suspended: string[];
  /** Last exercise result per rule id. */
  ruleScores: Record<string, RuleScore>;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'mix',
  newPerDay: 15,
  retention: 0.9,
  ttsRate: 0.9,
  autoplay: true,
  theme: 'system',
  scope: {},
  voices: {},
  suspended: [],
  ruleScores: {},
};
