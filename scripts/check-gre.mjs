/** Browser regression checks. Start npm run dev first, then node scripts/check-gre.mjs. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const base = process.env.GRE_TEST_URL || "http://localhost:5188/";
const book = JSON.parse(
  fs.readFileSync("public/gre/gre-equivalent.json", "utf8"),
);
const key = "word-atlas:v2:gre-equivalent";
const coreBook = JSON.parse(
  fs.readFileSync("public/gre/gre-core.json", "utf8"),
);
fs.mkdirSync("tmp", { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  timezoneId: "Asia/Shanghai",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await context.addInitScript(() => {
  if (!localStorage.getItem("word-atlas:settings"))
    localStorage.setItem(
      "word-atlas:settings",
      JSON.stringify({
        dataset: "gre-equivalent",
        onboarded: true,
        splash: false,
        sfx: false,
        ambience: "off",
        autoplay: false,
      }),
    );
  // Verify text/accent routing without depending on installed OS voices in CI.
  window.__spoken = [];
  speechSynthesis.speak = (u) => {
    window.__spoken.push({ text: u.text, lang: u.lang });
    queueMicrotask(() => u.onend?.(new Event("end")));
  };
  speechSynthesis.cancel = () => {};
});
const choose = (id) =>
  page.getByRole("combobox", { name: "选择词库" }).first().selectOption(id);
const readProgress = () =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
const flush = () =>
  page.waitForFunction((k) => {
    const p = JSON.parse(localStorage.getItem(k) || "null");
    return p?.session;
  }, key);
try {
  await page.goto(base);
  await page.getByRole("button", { name: "从今天开始 5 天计划" }).waitFor();
  assert.equal(await page.locator(".plan-days li").count(), 5);
  await page.getByRole("button", { name: "从今天开始 5 天计划" }).click();
  await page.getByRole("button", { name: "开始今天的旅程" }).waitFor();
  await page.screenshot({ path: "tmp/gre-desktop.png", fullPage: true });
  assert.match(await page.locator(".journey").innerText(), /180/);
  await page.getByRole("button", { name: "开始今天的旅程" }).click();
  await page.getByRole("button", { name: "认识了" }).waitFor();
  await flush();
  assert.equal((await readProgress()).session.newIds.length, 20);
  assert.equal((await readProgress()).session.newIds[0], book.entries[0].id);
  for (let i = 0; i < 5; i++)
    await page.getByRole("button", { name: "认识了" }).click();
  await page.waitForFunction(
    (k) => JSON.parse(localStorage.getItem(k)).session.index === 5,
    key,
  );
  const p = await readProgress();
  const step = p.session.steps[5];
  await page.locator(`[data-option="${step.id}"]`).click();
  await page.waitForFunction(
    (k) => Object.keys(JSON.parse(localStorage.getItem(k)).cards).length === 1,
    key,
  );
  await page.reload();
  await page.locator(".feedback").waitFor();
  assert.equal(Object.keys((await readProgress()).cards).length, 1);
  // Completing a batch exposes a direct continuation and does not end the daily task.
  await page.evaluate((key) => {
    const p = JSON.parse(localStorage.getItem(key));
    const card = {
      due: Date.now() + 86400000,
      s: 2,
      d: 5,
      el: 0,
      sd: 1,
      ls: 0,
      reps: 1,
      lapses: 0,
      st: 2,
      seen: Date.now(),
    };
    for (const id of p.session.newIds) {
      p.cards[id] = card;
      p.session.graded[id] = 3;
    }
    p.session.index = p.session.steps.length;
    p.session.finished = Date.now();
    localStorage.setItem(key, JSON.stringify(p));
  }, key);
  await page.reload();
  await page.getByText("今天还剩 160 个新词，可以继续下一轮。").waitFor();
  await page.getByRole("button", { name: "继续下一轮（20 个新词）" }).click();
  await page.getByRole("button", { name: "认识了" }).waitFor();
  await page.waitForFunction(
    ({ key, id }) =>
      JSON.parse(localStorage.getItem(key)).session.newIds[0] === id,
    { key, id: book.entries[20].id },
  );
  await page.getByRole("button", { name: "暂停并返回" }).click();
  await choose("gre-core");
  await page.waitForFunction(() => document.title.includes("镇考机经词"));
  await page.getByText(/每日目标 200 个新词/).waitFor();
  assert.match(await page.locator(".journey").innerText(), /200/);
  assert.equal(await page.locator(".plan-days").count(), 0);
  assert.equal(await page.locator(".topic-tiles li").count(), 7);
  assert.equal(await page.locator(".alignment-table tbody tr").count(), 8);
  await page.getByRole("button", { name: "开始今天的旅程" }).click();
  await page.getByRole("button", { name: "认识了" }).waitFor();
  await page.waitForFunction(
    (id) =>
      JSON.parse(localStorage.getItem("word-atlas:v2:gre-core") || "null")
        ?.session?.newIds[0] === id,
    coreBook.learning.order[0],
  );
  assert.deepEqual(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("word-atlas:v2:gre-core")).session
          .newIds,
    ),
    coreBook.learning.order.slice(0, 20),
  );
  await page.getByRole("button", { name: "暂停并返回" }).click();
  await page
    .locator(".alignment-table tbody tr")
    .nth(1)
    .getByRole("button", { name: "查看", exact: true })
    .click();
  await page.locator(".atlas").waitFor();
  assert.match(page.url(), /studyDay=2/);
  assert.equal(
    (await page.locator(".result-count").innerText()).trim(),
    "200 个结果",
  );
  await page.reload();
  await page.locator(".atlas").waitFor();
  assert.equal(
    (await page.locator(".result-count").innerText()).trim(),
    "200 个结果",
  );
  // Source DAY remains a separate filter after reordering the learning path.
  await page.goto(`${base}#/atlas?topic=day-1&view=list`);
  await page.locator(".atlas").waitFor();
  assert.equal(
    (await page.locator(".result-count").innerText()).trim(),
    "210 个结果",
  );
  await page.goto(base);
  await page.locator(".alignment-table").waitFor();
  await page.screenshot({
    path: "tmp/gre-aligned-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: "tmp/gre-aligned-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await choose("gre-equivalent");
  await page.getByRole("button", { name: "继续旅程" }).waitFor();
  assert.equal(Object.keys((await readProgress()).cards).length, 20);

  // Entry contains original equivalent group; every partner has a speech control.
  await page.goto(`${base}#/atlas?w=${book.entries[0].id}`);
  await page.getByRole("heading", { name: "mitigate", exact: true }).waitFor();
  const [recording] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/atlas/audio/uk/mitigate.mp3")),
    page.getByRole("dialog", { name: "mitigate 词条" }).getByRole("button", { name: "朗读 mitigate", exact: true }).click(),
  ]);
  assert.equal(recording.ok(), true);
  await page.getByRole("button", { name: "朗读 abate", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.__spoken.at(-1)), {
    text: "abate",
    lang: "en-GB",
  });
  await page.screenshot({ path: "tmp/gre-entry.png", fullPage: false });
  await page.goto(`${base}#/me`);
  await page.getByRole("button", { name: "美式", exact: true }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("word-atlas:settings")).accent === "us",
  );
  await page.goto(`${base}#/atlas?w=${book.entries[0].id}`);
  await page.getByRole("button", { name: "朗读 abate", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.__spoken.at(-1)), {
    text: "abate",
    lang: "en-US",
  });

  // Simulate finishing day one. Day two stays locked today, even after a reload.
  await page.evaluate(
    ({ key, ids }) => {
      const p = JSON.parse(localStorage.getItem(key));
      const card = {
        due: Date.now() + 86400000,
        s: 2,
        d: 5,
        el: 0,
        sd: 1,
        ls: 0,
        reps: 1,
        lapses: 0,
        st: 2,
        seen: Date.now(),
      };
      for (const id of ids) p.cards[id] = card;
      p.session = null;
      localStorage.setItem(key, JSON.stringify(p));
    },
    { key, ids: book.groups[0].ids },
  );
  await page.goto(base);
  await page.getByText(/第 2 天尚未到解锁日期/).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "开始今天的旅程" }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("button", { name: "再认识 5 个新词" }).count(),
    0,
  );
  await page.evaluate((key) => {
    const p = JSON.parse(localStorage.getItem(key));
    const d = new Date();
    d.setDate(d.getDate() - 1);
    p.planStarted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    localStorage.setItem(key, JSON.stringify(p));
  }, key);
  await page.reload();
  await page.getByText(/当前：第 2 天，还剩 182/).waitFor();

  // Small-screen plan, chooser and word sheet fit without horizontal page overflow.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "tmp/gre-mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page
    .locator(".plan-days li")
    .last()
    .getByRole("button", { name: "查看词表" })
    .click();
  await page.locator(".atlas").waitFor();
  assert.match(page.url(), /topic=day-5/);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.goto(`${base}#/me`);
  await choose("gre-core");
  await page.waitForFunction(() => document.title.includes("镇考机经词"));
  await page.goto(`${base}#/atlas?w=gre-core-p5-r3`);
  await page.getByRole("heading", { name: "noisome", exact: true }).waitFor();
  assert.match(
    await page.locator(".entry").innerText(),
    /Most people deal with/,
  );
  await page.screenshot({ path: "tmp/gre-core-mobile.png", fullPage: false });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.goto(`${base}#/me`);
  await choose("open");
  await page.waitForFunction(() => document.title.includes("Word Atlas Open"));
  assert.equal(await page.locator(".plan-days").count(), 0);
  await page.goto(`${base}#/me`);
  await page.getByText("每日新词", { exact: true }).waitFor();
  // A new learner can select either GRE book from the welcome dialog.
  const newcomer = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "Asia/Shanghai",
  });
  const welcome = await newcomer.newPage();
  await welcome.addInitScript(() =>
    localStorage.setItem(
      "word-atlas:settings",
      JSON.stringify({ splash: false, sfx: false, ambience: "off" }),
    ),
  );
  await welcome.goto(base);
  await welcome.getByRole("dialog", { name: "欢迎" }).waitFor();
  await welcome
    .getByRole("dialog")
    .getByRole("combobox", { name: "选择词库" })
    .selectOption("gre-core");
  await welcome.getByText(/保留原书 7 个 DAY 分组/).waitFor();
  await welcome.getByRole("button", { name: "出发", exact: false }).click();
  await welcome
    .getByRole("dialog", { name: "欢迎" })
    .waitFor({ state: "hidden" });
  await welcome.screenshot({
    path: "tmp/gre-core-home-mobile.png",
    fullPage: false,
  });
  await newcomer.close();
  assert.deepEqual(errors, []);
  console.log(
    "GRE browser checks passed: separate books, pause/reload, day locks, source examples, UK/US speech routing, desktop/mobile layouts.",
  );
} catch (error) {
  console.error(error);
  await page.screenshot({path: "tmp/gre-check-failure.png", fullPage: false}).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
