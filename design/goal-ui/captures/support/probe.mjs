// Real-browser checks for review 6563729015 (D-048-p3-support), synthetic only:
// every /api call is answered in the browser, nothing reaches a backend.
// Run against the same local client as capture.mjs:
//   node design/goal-ui/captures/support/probe.mjs
// Checks at 390x844 (touch) and 1280x900:
//   help-policy   the Rules & policies targets are >= 44px tall, do not overlap,
//                 and a tap at each target's centre opens that link, not the next;
//   report-edges  unselected tiles and off toggles draw a control-edge border
//                 with >= 3:1 contrast against the canvas (WCAG 1.4.11);
//   safety-keys   each safety row is reachable by Tab, shows a marker, and
//                 Enter and Space toggle aria-expanded;
//   offline-toast the offline notice does not cover the details step's Submit
//                 or its offline line with the page scrolled to its end.
// Exit code 1 when any check fails; output: probe-<head>.json beside this file.
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");
const BASE = process.env.CAPTURE_BASE || "http://localhost:5199";
const SEEKER = { id: 41, name: "Synthetic Seeker", email: "seeker@synthetic.example", role: "user", openId: "fixture", loginMethod: "fixture" };

const lum = rgb => {
  const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function open(browser, width, height, route, offline = false) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600 });
  const page = await context.newPage();
  await page.route("https://**", r => r.abort());
  await page.route(url => new URL(url).pathname.startsWith("/api/"), async r => {
    const url = new URL(r.request().url());
    const json = (status, body) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.startsWith("/api/trpc/")) {
      const body = url.pathname.slice("/api/trpc/".length).split(",").map(p => ({ result: { data: { json: p === "auth.me" ? SEEKER : null } } }));
      return json(200, url.searchParams.get("batch") ? body : body[0]);
    }
    if (url.pathname === "/api/dev-auth/session") return json(200, { signedIn: true, account: SEEKER });
    if (url.pathname === "/api/credits/summary") return json(200, { summary: { totalAvailable: 3 } });
    return json(404, { error: "not mocked" });
  });
  await page.addInitScript(() => { localStorage.setItem("skipwait:cookie-consent", "all"); });
  await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-goal-page]", { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  if (offline) await context.setOffline(true);
  return { context, page };
}

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const checks = [];
const check = (name, width, pass, detail) => { checks.push({ name, width, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"} ${name} @${width}: ${JSON.stringify(detail)}`); };
try {
  for (const [width, height] of [[390, 844], [1280, 900]]) {
    // help-policy
    {
      const { context, page } = await open(browser, width, height, "/help");
      const links = page.getByRole("navigation", { name: "Rules & policies" }).getByRole("link");
      const n = await links.count();
      // The hit area is the box plus any ::after extension (g-hit), measured in the page.
      const boxes = await links.evaluateAll(els => els.map(el => {
        const r = el.getBoundingClientRect(); const after = getComputedStyle(el, "::after");
        const w = after.content !== "none" && after.position === "absolute" ? Math.max(r.width, parseFloat(after.width) || 0) : r.width;
        const h = after.content !== "none" && after.position === "absolute" ? Math.max(r.height, parseFloat(after.height) || 0) : r.height;
        return { href: el.getAttribute("href"), x: r.x + r.width / 2 - w / 2, y: r.y + r.height / 2 - h / 2, width: w, height: h, visualHeight: r.height };
      }));
      const tall = boxes.every(b => b.height >= 44 && b.visualHeight >= 44);
      const overlaps = [];
      for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) if (overlap(boxes[i], boxes[j])) overlaps.push([boxes[i].href, boxes[j].href]);
      check("help-policy-targets", width, n === 4 && tall && overlaps.length === 0, { boxes: boxes.map(b => ({ href: b.href, height: Math.round(b.height), visualHeight: Math.round(b.visualHeight) })), overlaps });
      const taps = [];
      for (let i = 0; i < n; i += 1) {
        const link = links.nth(i); await link.scrollIntoViewIfNeeded();
        const r = await link.boundingBox(); const href = await link.getAttribute("href");
        // Tap near the bottom and top edges of the 44px box too, where a neighbour's overflow would land.
        for (const dy of [r.height / 2, 2, r.height - 2]) {
          const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("a")?.getAttribute("href") ?? null, [r.x + Math.min(20, r.width / 2), r.y + dy]);
          taps.push({ href, dy: Math.round(dy), hit });
        }
      }
      check("help-policy-taps", width, taps.every(t => t.hit === t.href), taps.filter(t => t.hit !== t.href));
      await context.close();
    }
    // report-edges
    {
      const { context, page } = await open(browser, width, height, "/report?request=42");
      const canvas = await page.evaluate(() => getComputedStyle(document.querySelector("[data-goal-page]")).backgroundColor);
      const tile = await page.getByRole("radio", { name: /Harassment/ }).evaluate(el => getComputedStyle(el.closest("label")).borderTopColor);
      await page.getByRole("button", { name: "Continue" }).click();
      const toggles = await page.locator("button[aria-pressed='false']").evaluateAll(els => els.map(el => ({ name: el.textContent.slice(0, 22), border: getComputedStyle(el).borderTopColor })));
      const all = [{ name: "unselected tile", border: tile }, ...toggles].map(t => ({ ...t, ratio: Number(contrast(t.border, canvas).toFixed(2)) }));
      check("report-control-edges", width, toggles.length === 2 && all.every(t => t.ratio >= 3), { canvas, controls: all });
      await context.close();
    }
    // safety-keys
    {
      const { context, page } = await open(browser, width, height, "/safety");
      const region = page.getByRole("region", { name: "Safety questions" });
      const rows = region.getByRole("button");
      const count = await rows.count();
      const results = [];
      for (let i = 0; i < count; i += 1) {
        const row = rows.nth(i);
        await row.focus();
        const marker = await row.evaluate(el => { const svg = el.querySelector("svg"); if (!svg) return false; const r = svg.getBoundingClientRect(); return r.width >= 12 && r.height >= 12 && getComputedStyle(svg).visibility !== "hidden"; });
        const before = await row.getAttribute("aria-expanded");
        await page.keyboard.press("Enter"); const afterEnter = await row.getAttribute("aria-expanded");
        await page.keyboard.press("Space"); const afterSpace = await row.getAttribute("aria-expanded");
        results.push({ i, marker, before, afterEnter, afterSpace });
      }
      const ok = count === 6 && results.every(r => r.marker && r.before !== null && r.afterEnter !== r.before && r.afterSpace === r.before);
      check("safety-disclosure-keys", width, ok, { count, results });
      await context.close();
    }
    // offline-toast (current head verification of the older finding)
    {
      const { context, page } = await open(browser, width, height, "/report");
      await page.getByRole("button", { name: "Continue" }).click();
      await context.setOffline(true);
      await page.waitForTimeout(300);
      const submit = page.getByRole("button", { name: "Submit report" });
      // Worst reachable case for the reader: scrolled to the very end, where content cannot move further up.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(150);
      const notice = page.locator("[data-goal-wrapper='notice'] > *").first();
      const present = await notice.count();
      const noticeBox = present ? await notice.boundingBox() : null;
      const targets = [await submit.boundingBox(), await page.getByText("Nothing is sent while you're offline").boundingBox()];
      const covered = noticeBox ? targets.filter(t => t && overlap(noticeBox, t)).length : 0;
      check("offline-notice-overlap", width, covered === 0, { noticePresent: present > 0, noticeBox, targets, covered });
      await context.close();
    }
  }
} finally {
  await browser.close();
  const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain", "client/src/pages/goal/support"], { encoding: "utf8" }).trim() ? "+worktree" : "";
  await writeFile(new URL(`probe-${process.env.PROBE_LABEL || head + dirty}.json`, import.meta.url), JSON.stringify({ source: head + dirty, synthetic: true, checks }, null, 2) + "\n");
}
process.exit(checks.every(c => c.pass) ? 0 : 1);
