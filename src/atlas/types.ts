export type Accent = "uk" | "us";

/** Compact row from atlas/index.json: [id, word, zh, ipa, cefr, topic, media]. */
export type IndexRow = [string, string, string, string, number, number, number];

export interface Sense {
  pos: string;
  zh: string;
  en: string;
}

export interface Example {
  en: string;
  zh: string;
}

export interface Entry {
  id: string;
  w: string;
  uk: string;
  us: string;
  senses: Sense[];
  ex: Example[];
  col: string[];
  fam: string[];
  syn: string[];
  ant: string[];
  tip: string;
  cefr: string;
  topic: string;
  /** Usage caution (register, offensiveness, spelling), shown with the entry. */
  note?: string;
  /** Original PDF location; GRE entries retain their source order and groups. */
  source?: { page: number; row: number; day: number };
  /** Media bit flags, see MEDIA. */
  m: number;
  /** Absolute media URLs for datasets that do not follow the atlas layout. */
  media?: {
    img?: string | null;
    uk?: string | null;
    us?: string | null;
    ex?: string | null;
    ex2?: string | null;
  };
}

export const MEDIA = { img: 1, uk: 2, us: 4, ex: 8, ex2: 16 } as const;

export interface WordRef {
  id: string;
  word: string;
  zh: string;
  ipa: string;
  cefr: number;
  topic: number;
  media: number;
  /** Position in the learning path. */
  order: number;
}

export interface AlignedLearning {
  version: number;
  dailyTarget: number;
  order: string[];
  equivalentSha256: string;
  days: {
    day: number;
    label: string;
    ids: string[];
    exact: number;
    related: number;
    supplement: number;
  }[];
  matches: Record<
    string,
    {
      kind:
        | "same-word"
        | "equivalent"
        | "shared-equivalent"
        | "same-meaning"
        | "supplement";
      equivalentId: string | null;
      equivalentWord: string | null;
      evidence: string;
      anchorIndex: number;
    }
  >;
}

export interface Atlas {
  id: string;
  name: string;
  kind: "open" | "private";
  count: number;
  examples: number;
  illustrated: number;
  topics: [string, string][];
  cefr: string[];
  words: WordRef[];
  byId: Map<string, WordRef>;
  source?: { title: string; url: string; description: string };
  /** Per-day new-word target, independent of the ordinary IELTS setting. */
  dailyTarget?: number;
  batchSize?: number;
  learning?: AlignedLearning;
  plan?: {
    days: { day: number; label: string; ids: string[]; pages: number[] }[];
    batchSize: number;
  };
  /** Loads full entries; chunked for the open atlas, in-memory for private sets. */
  entry: (id: string) => Promise<Entry>;
  peek: (id: string) => Entry | undefined;
  img: (ref: WordRef | Entry, size?: "thumb" | "full") => string | null;
  audio: (
    ref: WordRef | Entry,
    kind: "uk" | "us" | "ex" | "ex2",
  ) => string | null;
}
