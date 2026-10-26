import type { AlignedLearning, Atlas, Entry, WordRef } from "./types";
import { MEDIA } from "./types";

export const GRE_DATASETS = [
  {
    id: "gre-equivalent",
    name: "真经 GRE 等价词汇总",
    description: "原书顺序 · 严格 5 天计划",
  },
  {
    id: "gre-core",
    name: "GRE 镇考机经词 7.0（乱序版）",
    description: "与等价词同日对齐 · 每天 200 词",
  },
] as const;
export type GreDataset = (typeof GRE_DATASETS)[number]["id"];

interface GreFile {
  id: GreDataset;
  name: string;
  source: NonNullable<Atlas["source"]>;
  groups: { day: number; label: string; ids: string[]; pages: number[] }[];
  entries: Entry[];
  learning?: AlignedLearning;
}

export async function loadGreAtlas(
  id: GreDataset,
  open: Atlas,
): Promise<Atlas> {
  const res = await fetch(`${import.meta.env.BASE_URL}gre/${id}.json`);
  if (!res.ok) throw new Error(`GRE 词库加载失败（${res.status}）`);
  const data = (await res.json()) as GreFile;
  if (data.id !== id || !data.entries.length)
    throw new Error("GRE 词库数据不完整");
  const entries = new Map(data.entries.map((e) => [e.id, e]));
  const ordered = data.learning
    ? data.learning.order.map((eid) => entries.get(eid))
    : data.entries;
  if (
    ordered.length !== entries.size ||
    ordered.some((e) => !e) ||
    new Set(ordered.map((e) => e!.id)).size !== entries.size
  )
    throw new Error("GRE 学习顺序数据不完整");
  const twins = new Map(open.words.map((w) => [w.word.toLowerCase(), w]));
  const twin = (e: Entry) => twins.get(e.w.toLowerCase());
  const words: WordRef[] = (ordered as Entry[]).map((e, order) => {
    const match = twin(e);
    const m = match ? match.media & (MEDIA.img | MEDIA.uk | MEDIA.us) : 0;
    e.m = m;
    // Reuse existing recordings and illustrations only for an exact spelling match.
    if (!e.uk && match?.ipa) e.uk = match.ipa;
    return {
      id: e.id,
      word: e.w,
      zh: e.senses.map((s) => `${s.pos} ${s.zh}`.trim()).join("；"),
      ipa: e.uk,
      cefr: 0,
      topic: data.groups.findIndex((g) => g.day === e.source?.day),
      media: m,
      order,
    };
  });
  const byId = new Map(words.map((w) => [w.id, w]));
  const get = (id: string) => {
    const e = entries.get(id);
    if (!e) throw new Error(`没有找到词条 ${id}`);
    return e;
  };
  return {
    id,
    name: data.name,
    kind: "open",
    source: data.source,
    dailyTarget: id === "gre-core" ? 200 : undefined,
    learning: data.learning,
    batchSize: 20,
    plan:
      id === "gre-equivalent"
        ? { days: data.groups, batchSize: 20 }
        : undefined,
    count: words.length,
    examples: data.entries.reduce((n, e) => n + e.ex.length, 0),
    illustrated: words.filter((w) => w.media & MEDIA.img).length,
    topics: data.groups.map((g) => [`day-${g.day}`, g.label]),
    cefr: ["GRE"],
    words,
    byId,
    peek: (id) => entries.get(id),
    entry: async (id) => get(id),
    img(ref, size) {
      const w = twin(get(ref.id));
      return w ? open.img(w, size) : null;
    },
    audio(ref, kind) {
      // IELTS example audio belongs to different sentences and must never be reused.
      if (kind === "ex" || kind === "ex2") return null;
      const w = twin(get(ref.id));
      return w ? open.audio(w, kind) : null;
    },
  };
}
