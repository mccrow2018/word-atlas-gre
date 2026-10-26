import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Atlas, Entry, WordRef } from "../atlas/types";
import { calendarDistance, fixedPlan } from "./plan";
import { buildSession, distractors, todayPlan } from "./session";
import {
  dayKey,
  defaultSettings,
  emptyProgress,
  sanitizeProgress,
  sanitizeSettings,
} from "./store";

const equivalent = JSON.parse(
  readFileSync("public/gre/gre-equivalent.json", "utf8"),
);
const core = JSON.parse(readFileSync("public/gre/gre-core.json", "utf8"));
const entries = new Map<string, Entry>(
  equivalent.entries.map((e: Entry) => [e.id, e]),
);
const words: WordRef[] = equivalent.entries.map((e: Entry, order: number) => ({
  id: e.id,
  word: e.w,
  zh: e.senses[0].zh,
  ipa: "",
  cefr: 0,
  topic: e.source!.day - 1,
  media: 0,
  order,
}));
const atlas = {
  id: equivalent.id,
  words,
  byId: new Map(words.map((w) => [w.id, w])),
  plan: { days: equivalent.groups, batchSize: 20 },
  peek: (id: string) => entries.get(id),
} as Atlas;
const card = {
  due: Number.MAX_SAFE_INTEGER,
  s: 2,
  d: 5,
  el: 0,
  sd: 1,
  ls: 0,
  reps: 1,
  lapses: 0,
  st: 2 as const,
  seen: 1,
};

test("PDF books stay separate, retain source order, and match their original daily boundaries", () => {
  assert.deepEqual(
    equivalent.groups.map((g: { ids: string[] }) => g.ids.length),
    [180, 182, 181, 177, 185],
  );
  assert.deepEqual(
    core.groups.map((g: { ids: string[] }) => g.ids.length),
    [210, 210, 210, 210, 210, 210, 190],
  );
  assert.equal(equivalent.entries.length, 905);
  assert.equal(core.entries.length, 1450);
  const allIds = [...equivalent.entries, ...core.entries].map(
    (e: Entry) => e.id,
  );
  assert.equal(new Set(allIds).size, allIds.length);
  for (const book of [equivalent, core]) {
    assert.deepEqual(
      book.groups.flatMap((g: { ids: string[] }) => g.ids),
      book.entries.map((e: Entry) => e.id),
    );
    assert.equal(
      new Set(book.entries.map((e: Entry) => e.w)).size,
      book.entries.length,
    );
    assert(
      book.entries.every(
        (e: Entry) =>
          e.senses.length && e.senses.every((s) => s.zh) && e.source && e.syn,
      ),
    );
  }
  assert.equal(equivalent.entries[0].w, "mitigate");
  assert.deepEqual(equivalent.entries[0].syn, [
    "abate",
    "curtail",
    "temper",
    "ameliorate",
  ]);
  assert.equal(core.entries[0].w, "noisome");
  assert(core.entries[0].ex[0].en.includes("noisome"));
  assert(
    core.entries.find((e: Entry) => e.w === "reticent").uk === "[ˈretɪsnt]",
  );
  assert(core.entries.some((e: Entry) => e.w === "keep abreast of"));
  assert(core.entries.every((e: Entry) => !/[\u4e00-\u9fff\n]/.test(e.w)));
});

test("five-day course requires starting and ignores ordinary daily quotas", () => {
  const p = emptyProgress(atlas.id);
  assert.equal(todayPlan(atlas, p, defaultSettings).fresh.length, 0);
  p.planStarted = dayKey();
  assert.equal(
    todayPlan(atlas, p, { ...defaultSettings, dailyNew: 0, startLevel: 5 })
      .fresh.length,
    180,
  );
  const session = buildSession(atlas, p, defaultSettings);
  assert.deepEqual(session.newIds, equivalent.groups[0].ids.slice(0, 20));
  assert.equal(session.steps.length, 40);
  assert.equal(
    buildSession(atlas, p, defaultSettings, {
      ids: [equivalent.groups[1].ids[0]],
    }).steps.length,
    0,
  );
});

test("next day needs both calendar unlock and completion; missed tasks never skip", () => {
  const p = { ...emptyProgress(atlas.id), planStarted: "2026-10-26" };
  assert.equal(fixedPlan(atlas, p, "2026-10-30")!.current!.day, 1);
  for (const id of equivalent.groups[0].ids) p.cards[id] = card;
  const sameDay = fixedPlan(atlas, p, "2026-10-26")!;
  assert.equal(sameDay.current!.day, 2);
  assert.equal(sameDay.available, false);
  assert.equal(sameDay.fresh.length, 0);
  const tomorrow = fixedPlan(atlas, p, "2026-10-27")!;
  assert.equal(tomorrow.available, true);
  assert.equal(tomorrow.fresh.length, 182);
  const restored = sanitizeProgress(p, atlas.id);
  assert.equal(restored.planStarted, p.planStarted);
  assert.deepEqual(
    fixedPlan(atlas, restored, "2026-10-27")!.fresh,
    tomorrow.fresh,
  );
  for (const w of words) p.cards[w.id] = card;
  assert.equal(fixedPlan(atlas, p, "2026-10-30")!.complete, true);
});

test("calendar arithmetic crosses month/year and DST dates without losing tasks", () => {
  assert.equal(calendarDistance("2026-10-31", "2026-11-01"), 1);
  assert.equal(calendarDistance("2026-12-31", "2027-01-01"), 1);
  assert.equal(calendarDistance("2026-03-07", "2026-03-09"), 2);
  assert.equal(sanitizeSettings({ dataset: "gre-core" }).dataset, "gre-core");
  assert.equal(
    sanitizeSettings({ dataset: "gre-equivalent" }).dataset,
    "gre-equivalent",
  );
});

test("all 180 equivalent entries can be learned in nine batches on the same day", () => {
  const p = { ...emptyProgress(atlas.id), planStarted: dayKey() };
  const learned: string[] = [];
  for (let round = 0; round < 9; round++) {
    const session = buildSession(atlas, p, defaultSettings);
    assert.equal(session.newIds.length, 20);
    for (const id of session.newIds) {
      p.cards[id] = card;
      learned.push(id);
    }
  }
  assert.deepEqual(learned, equivalent.groups[0].ids);
  assert.equal(todayPlan(atlas, p, defaultSettings).fresh.length, 0);
  assert.equal(fixedPlan(atlas, p)!.current!.day, 2);
  assert.equal(fixedPlan(atlas, p)!.available, false);
});

test("core daily target is 200 across ten batches, independent of IELTS settings", () => {
  const ordered = core.learning.order.map((id: string) =>
    core.entries.find((e: Entry) => e.id === id),
  );
  const coreWords: WordRef[] = ordered.map((e: Entry, order: number) => ({
    id: e.id,
    word: e.w,
    zh: e.senses[0].zh,
    ipa: e.uk,
    cefr: 0,
    topic: e.source!.day - 1,
    media: 0,
    order,
  }));
  const coreEntries = new Map<string, Entry>(
    core.entries.map((e: Entry) => [e.id, e]),
  );
  const a = {
    ...atlas,
    id: "gre-core",
    plan: undefined,
    dailyTarget: 200,
    batchSize: 20,
    words: coreWords,
    byId: new Map(coreWords.map((w) => [w.id, w])),
    peek: (id: string) => coreEntries.get(id),
  };
  const p = emptyProgress(a.id);
  assert.equal(
    todayPlan(a, p, { ...defaultSettings, dailyNew: 5 }).fresh.length,
    200,
  );
  for (let round = 0; round < 10; round++) {
    const session = buildSession(a, p, defaultSettings);
    assert.deepEqual(
      session.newIds,
      coreWords.slice(round * 20, round * 20 + 20).map((w) => w.id),
    );
    for (const id of session.newIds) p.cards[id] = card;
    p.days[dayKey()] = {
      n: (round + 1) * 20,
      r: (round + 1) * 20,
      c: (round + 1) * 20,
      t: 0,
    };
  }
  assert.equal(todayPlan(a, p, defaultSettings).fresh.length, 0);
  assert.equal(
    buildSession(a, p, defaultSettings, { ids: [coreWords[200].id] }).newIds
      .length,
    0,
  );
  p.days = {};
  assert.equal(todayPlan(a, p, defaultSettings).fresh.length, 200);
  assert.equal(todayPlan(a, p, defaultSettings).fresh[0], coreWords[200].id);
  for (const w of coreWords.slice(0, 1400)) p.cards[w.id] = card;
  assert.equal(todayPlan(a, p, defaultSettings).fresh.length, 50);
});

test("alignment preserves the equivalent file byte-for-byte and every original core entry", () => {
  const equivalentHash = createHash("sha256")
    .update(readFileSync("public/gre/gre-equivalent.json"))
    .digest("hex");
  assert.equal(
    equivalentHash,
    "9c343b62bf0027543446d8d2cb078b323adf17b86f3db350a1e2da3015e445db",
  );
  assert.equal(core.learning.equivalentSha256, equivalentHash);
  assert.equal(
    createHash("sha256").update(JSON.stringify(core.entries)).digest("hex"),
    "568158a7b75589a7cc608920d31928121b504fe402a816f0daab4db9694997d2",
  );
  assert.deepEqual(
    core.learning.days.map((d: { ids: string[] }) => d.ids.length),
    [200, 200, 200, 200, 200, 200, 200, 50],
  );
  assert.deepEqual(
    core.learning.days.flatMap((d: { ids: string[] }) => d.ids),
    core.learning.order,
  );
  assert.equal(new Set(core.learning.order).size, 1450);
  assert.deepEqual(
    new Set(core.learning.order),
    new Set(core.entries.map((e: Entry) => e.id)),
  );
});

test("every shared headword is on its equivalent day and retains the equivalent relative order", () => {
  const coreById = new Map<string, Entry>(
    core.entries.map((e: Entry) => [e.id, e]),
  );
  const coreHeads = new Set(core.entries.map((e: Entry) => e.w.toLowerCase()));
  const expectedCounts = [167, 164, 168, 166, 166];
  for (let i = 0; i < 5; i++) {
    const eqDay = equivalent.entries.filter(
      (e: Entry) => e.source!.day === i + 1,
    );
    const expected = eqDay
      .filter((e: Entry) => coreHeads.has(e.w.toLowerCase()))
      .map((e: Entry) => e.w.toLowerCase());
    const expectedSet = new Set(expected);
    const day = core.learning.days[i];
    const actual = day.ids
      .map((id: string) => coreById.get(id)!.w.toLowerCase())
      .filter((w: string) => expectedSet.has(w));
    assert.deepEqual(actual, expected);
    assert.equal(day.exact, expectedCounts[i]);
    assert.equal(day.exact + day.related, 200);
    assert.equal(day.supplement, 0);
    for (const id of day.ids) {
      const match = core.learning.matches[id];
      assert.equal(entries.get(match.equivalentId)!.source!.day, i + 1);
      assert(match.evidence);
    }
  }
  // Stable IDs keep stored cards/bookmarks/sessions valid after order changes.
  const p = emptyProgress("gre-core");
  p.cards[core.entries[0].id] = card;
  p.bookmarks = [core.entries[0].id];
  const restored = sanitizeProgress(p, "gre-core");
  assert.equal(restored.cards[core.entries[0].id].reps, 1);
  assert(core.learning.order.includes(restored.bookmarks[0]));
});

test("answer choices exclude the target's equivalent words", () => {
  const ref = words[0];
  const equivalents = new Set(entries.get(ref.id)!.syn);
  for (const kind of ["listen", "meaning", "picture"] as const) {
    const ids = distractors(atlas, ref, kind, 42);
    assert.equal(ids.length, 4);
    assert(ids.includes(ref.id));
    assert(
      ids
        .filter((id) => id !== ref.id)
        .every((id) => !equivalents.has(atlas.byId.get(id)!.word)),
    );
  }
});
