#!/usr/bin/env node
// Handoff gate for the "your pick" comps (BRIEF.md 3.5 plus D-070), at 1280 and 390:
//   - one solid black element (#0A0A0A fill, at least 200 px²) per frame: each visible [data-frame]
//     element is a frame (the page itself when it marks none). A frame marked data-primary="none" has
//     no commit action (the phone queue list) and must hold none. Nothing black outside the frames.
//   - no mode switch anywhere (D-070): no "Mode" radiogroup, no "Seeking" / "Giving" text
//   - one navigation per persona: 3 places for a seeker, 4 (with Queue) for a verified referrer; the
//     quiet "Give a referral" link only for someone who is not a verified referrer
//   - type floor: visible text at least 12px; phone inputs and text boxes at least 16px
//   - nothing clips: no text cut or ellipsised by its box, nothing past the viewport edge
//   - text contrast at least 4.5:1 (3:1 for large text) on its composited background
//   - trust blue (#1D4ED8) only inside a verified mark
//   - no Unicode glyph icons (arrows, checks, symbols, emoji) in visible text
//   - every visible text fragment occurs in content.json (function lists are content.json's
//     functions joined with its functionsSeparator, so they are reported as composed). Where
//     content.json lags what shipped, lib.mjs's overlay supplies the shipped copy and this gate
//     prints the overlay first, so the lag stays visible until content.json catches up
//   - money figures (D-070): in any line that names credits, every figure is JetBrains Mono 500 at
//     13px, so one money phrase never appears in two faces; and every D MMM date is mono, prose
//     included (BRIEF 3.3)
//   - pass pickers: every visible reason list (desktop popover, phone sheet) shows the shipped reasons
//     in the shipped order, none preselected, with desktop keycaps 1..n
//   - interactive targets under 44px at 390 (radio inputs inside label rows are expected)
// Usage: node design/goal-ui/pick/src/gate.mjs [file.html ...]   (defaults to the three comps)
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { C as content, OVERLAYS } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const direction = path.resolve(here, "..");
const { chromium } = createRequire(path.resolve(here, "../../../../package.json"))("playwright");
for (const note of OVERLAYS) console.log(`note overlay: ${note}`);

const strings = [];
(function walk(v) {
  if (typeof v === "string") strings.push(v);
  else if (v && typeof v === "object") Object.values(v).forEach(walk);
})(content);
const composed = new Set(content.screenA.companies.map((c) => c.functions.join(content.screenA.functionsSeparator)));
const GLYPH = /[←-⇿⌀-⏿①-⓿■-➿⬀-⯿\u{1F300}-\u{1FAFF}]/u;
const MODE_TEXT = /\b(Seeking|Giving)\b/;

const files = process.argv.slice(2).length
  ? process.argv.slice(2).map((f) => path.resolve(f))
  : ["find-a-referral.html", "referral-queue.html", "my-asks.html"].map((f) => path.join(direction, f));

let failed = false;
const browser = await chromium.launch();
try {
  for (const file of files) {
    for (const [label, width, height] of [["desktop", 1280, 820], ["mobile", 390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto(`file://${file}`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const r = await page.evaluate(({ phone, reasons }) => {
        const visible = (el) => {
          for (let e = el; e; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (cs.display === "none" || cs.visibility === "hidden") return false;
          }
          return el.getClientRects().length > 0;
        };
        const inert = (el) => !!el.closest("[inert]");
        const textOf = (el) => el.textContent.replace(/\s+/g, " ").trim().slice(0, 34);

        // One black element per frame.
        const blackEls = [...document.querySelectorAll("body *")].filter((el) => {
          const b = el.getBoundingClientRect();
          return getComputedStyle(el).backgroundColor === "rgb(10, 10, 10)" && b.width * b.height >= 200 && visible(el);
        });
        const marked = [...document.querySelectorAll("[data-frame]")].filter(visible);
        const frames = marked.length ? marked : [document.body];
        const blacks = frames.map((f) => ({
          frame: f.dataset.frame ?? "page",
          expect: f.dataset.primary === "none" ? 0 : 1,
          found: blackEls.filter((el) => f.contains(el)).map(textOf),
        }));
        const strays = blackEls.filter((el) => !frames.some((f) => f.contains(el))).map(textOf);

        // Visible text nodes (with their parent element).
        const texts = [];
        const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (tw.nextNode()) {
          const t = tw.currentNode.textContent.replace(/\s+/g, " ").trim();
          const el = tw.currentNode.parentElement;
          if (t && visible(el) && !el.closest(".sr-only")) texts.push({ t, el });
        }

        // Money figures (D-070): within the nearest block that names credits, every figure is
        // JetBrains Mono 500 at 13px ("Uses 1 of your 2 credits", "1 credit spent", "2 credits").
        const blockOf = (el) => {
          let e = el;
          while (e && e !== document.body && getComputedStyle(e).display.startsWith("inline")) e = e.parentElement;
          return e;
        };
        const moneySans = [];
        for (const { t, el } of texts) {
          if (!/\d/.test(t) || inert(el)) continue;
          const block = blockOf(el);
          if (!block || !/\bcredits?\b/i.test(block.textContent)) continue;
          const cs = getComputedStyle(el);
          if (!cs.fontFamily.includes("JetBrains Mono") || cs.fontWeight !== "500" || cs.fontSize !== "13px") {
            moneySans.push(`${t.slice(0, 28)}@${cs.fontFamily.split(",")[0]} ${cs.fontWeight} ${cs.fontSize} in "${textOf(block)}"`);
          }
        }
        // Dates (BRIEF 3.3: "Dates are written D MMM in mono"), in prose too.
        const DATE = /\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;
        const sansDates = texts
          .filter(({ t, el }) => DATE.test(t) && !inert(el) && !getComputedStyle(el).fontFamily.includes("JetBrains Mono"))
          .map(({ t }) => t.slice(0, 40));

        // Mode switch: never.
        const modeSwitch = [...document.querySelectorAll('[role="radiogroup"][aria-label="Mode"], .switch')].filter(visible).length;

        // Navigation per frame: rail items (desktop) or bottom-bar items (phone), and the give link.
        const navs = frames.map((f) => {
          const items = [...f.querySelectorAll(phone ? ".bottombar__item" : ".rail__item")].filter((el) => visible(el) && !inert(el));
          const give = [...f.querySelectorAll(".give")].filter((el) => visible(el) && !inert(el)).length;
          return { frame: f.dataset.frame ?? "page", items: items.map((el) => el.textContent.trim()), give };
        });

        // Type floor and phone input size.
        const small = [...new Set(texts.filter(({ el }) => parseFloat(getComputedStyle(el).fontSize) < 12).map(({ t, el }) => `${t.slice(0, 24)}@${getComputedStyle(el).fontSize}`))];
        const inputs = phone
          ? [...document.querySelectorAll("input:not([type=radio]), textarea, [role=textbox]")].filter(visible)
              .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => `${el.getAttribute("aria-label") || el.id}@${getComputedStyle(el).fontSize}`)
          : [];

        // Clipping: text cut or ellipsised by its own box, or text past the viewport edge.
        const clipped = [];
        for (const el of new Set(texts.map(({ el }) => el))) {
          if (inert(el)) continue;
          const cs = getComputedStyle(el);
          const b = el.getBoundingClientRect();
          if (b.right > innerWidth + 0.5 || b.left < -0.5) clipped.push(`offscreen:${textOf(el)}`);
          if (cs.overflowX !== "visible" && el.scrollWidth > el.clientWidth + 1) clipped.push(`${cs.textOverflow === "ellipsis" ? "ellipsis" : "cut-x"}:${textOf(el)}`);
          if (cs.overflowY !== "visible" && el.scrollHeight > el.clientHeight + 1) clipped.push(`cut-y:${textOf(el)}`);
          // nowrap text wider than its parent's content box spills out of it
          const p = el.parentElement;
          if (p && cs.whiteSpace === "nowrap" && cs.position !== "absolute") {
            const pb = p.getBoundingClientRect();
            const ps = getComputedStyle(p);
            const inner = pb.right - parseFloat(ps.paddingRight) - parseFloat(ps.borderRightWidth);
            if (b.right > inner + 1 && ps.overflowX === "visible" && getComputedStyle(p).display !== "contents") clipped.push(`spill:${textOf(el)}`);
          }
        }

        // Any box spilling out of its parent's content box (an outdent with a negative margin is deliberate).
        for (const el of document.querySelectorAll("body *")) {
          if (!visible(el) || inert(el) || (el.closest("svg") && el.tagName !== "svg")) continue;
          const cs = getComputedStyle(el);
          const p = el.parentElement;
          if (!p || cs.position === "absolute" || cs.position === "fixed") continue;
          if (parseFloat(cs.marginLeft) < 0 || parseFloat(cs.marginRight) < 0) continue;
          const ps = getComputedStyle(p);
          if (ps.display === "contents") continue;
          const b = el.getBoundingClientRect();
          const pb = p.getBoundingClientRect();
          const right = pb.right - parseFloat(ps.paddingRight) - parseFloat(ps.borderRightWidth);
          const left = pb.left + parseFloat(ps.paddingLeft) + parseFloat(ps.borderLeftWidth);
          if (b.width && (b.right > right + 1 || b.left < left - 1)) clipped.push(`box-spill:${el.tagName.toLowerCase()}.${[...el.classList].join(".")}:${textOf(el)}`);
        }

        // Text contrast (WCAG 1.4.3): 4.5:1, or 3:1 for large text (24px, or 18.66px at 600+), against the
        // composited background. Backdrops behind a sheet ([inert]) are excluded: the scrim dims them on purpose.
        const rgba = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
        const lum = ({ r, g, b }) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
          .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
        const bgOf = (el) => {
          const layers = [];
          for (let e = el; e; e = e.parentElement) {
            const c = rgba(getComputedStyle(e).backgroundColor);
            if (c.a > 0) { layers.push(c); if (c.a >= 1) break; }
          }
          return layers.reverse().reduce((acc, c) => ({ r: c.r * c.a + acc.r * (1 - c.a), g: c.g * c.a + acc.g * (1 - c.a), b: c.b * c.a + acc.b * (1 - c.a) }), { r: 255, g: 255, b: 255 });
        };
        const lowContrast = [];
        for (const el of new Set(texts.map(({ el }) => el))) {
          if (inert(el)) continue;
          const cs = getComputedStyle(el);
          const fg = rgba(cs.color);
          const [l1, l2] = [lum(fg), lum(bgOf(el))].sort((a, b) => b - a);
          const ratio = (l1 + 0.05) / (l2 + 0.05);
          const size = parseFloat(cs.fontSize);
          const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 600);
          if (ratio < (large ? 3 : 4.5)) lowContrast.push(`${textOf(el)}@${ratio.toFixed(2)}`);
        }

        // Trust blue only inside a verified mark.
        const BLUE = "rgb(29, 78, 216)";
        const blue = [...document.querySelectorAll("body *")].filter((el) => {
          if (!visible(el) || inert(el)) return false;
          const cs = getComputedStyle(el);
          const isBlue = [cs.color, cs.backgroundColor, cs.borderTopColor, cs.outlineColor].includes(BLUE);
          const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          const drawsBlue = (cs.color === BLUE && (hasText || el.tagName === "svg")) || cs.backgroundColor === BLUE || (cs.borderTopColor === BLUE && parseFloat(cs.borderTopWidth) > 0);
          return isBlue && drawsBlue && !el.closest(".verified");
        }).map(textOf);

        const smallTargets = [...document.querySelectorAll("a, button, input, [role=radio], label.radio-row, [tabindex]")]
          .filter((el) => visible(el) && !inert(el))
          .map((el) => {
            const b = el.getBoundingClientRect();
            const hit = el.classList.contains("hit");
            const w = Math.round(hit ? Math.max(b.width, 44) : b.width);
            const h = Math.round(hit ? Math.max(b.height, 44) : b.height);
            const inRow = !!el.closest("label.radio-row");
            return { name: (el.getAttribute("aria-label") || el.textContent.trim() || el.type || el.tagName).slice(0, 34), w, h, inRow };
          })
          .filter((t) => (t.w < 44 || t.h < 44) && !t.inRow);

        // Pass pickers: every visible reason list shows the shipped reasons, in order, none preselected;
        // desktop keycaps run 1..n beside them.
        const pickers = [...document.querySelectorAll('[role="radiogroup"]')]
          .filter((g) => visible(g) && !inert(g) && g.querySelector('input[type="radio"]'))
          .map((g) => {
            const rows = [...g.querySelectorAll("label")];
            const labels = rows.map((l) => (l.querySelector(".pop-row__label") ?? l.querySelector("span")).textContent.trim());
            const keys = rows.map((l) => l.querySelector(".kbd")).filter((k) => k && visible(k)).map((k) => k.textContent.trim());
            const checked = g.querySelectorAll("input:checked").length;
            const ok = labels.join("|") === reasons.join("|") && checked === 0
              && (keys.length === 0 || keys.join("|") === reasons.map((_, i) => String(i + 1)).join("|"));
            return { ok, rows: labels.length, keys: keys.join(""), checked };
          });

        return { blacks, strays, texts: texts.map(({ t }) => t), moneySans, sansDates, pickers, modeSwitch, navs, small, inputs, clipped, lowContrast, blue, smallTargets };
      }, { phone: label === "mobile", reasons: content.screenB.detail.pass.reasons.map((x) => x.label) });

      const glyphs = r.texts.filter((t) => GLYPH.test(t));
      const modeText = r.texts.filter((t) => MODE_TEXT.test(t));
      const foreign = [...new Set(r.texts)].filter((t) => !/^0\d$/.test(t) && !composed.has(t) && !strings.some((s) => s.includes(t)));
      const blackBad = r.blacks.some((f) => f.found.length !== f.expect) || r.strays.length;
      const navBad = r.navs.some((n) => {
        if (!n.items.length) return false;                       // frames without nav (sheets, opened ask on phones)
        const referrer = n.items.includes("Queue");
        return n.items.length !== (referrer ? 4 : 3) || (referrer ? n.give !== 0 : n.give !== 1);
      });
      const pickerBad = r.pickers.some((p) => !p.ok);
      const bad = blackBad || navBad || pickerBad || r.modeSwitch || modeText.length || glyphs.length || foreign.length || r.moneySans.length || r.sansDates.length || r.small.length
        || r.inputs.length || r.clipped.length || r.lowContrast.length || r.blue.length || (label === "mobile" && r.smallTargets.length);
      failed ||= Boolean(bad);
      const perFrame = r.blacks.map((f) => `${f.frame}:${f.found.length}/${f.expect} ${JSON.stringify(f.found)}`).join(" ");
      const nav = r.navs.filter((n) => n.items.length || n.give).map((n) => `${n.frame}=[${n.items.join(", ")}]${n.give ? "+give" : ""}`).join(" ");
      const pick = r.pickers.map((p) => `${p.ok ? "" : "BAD "}${p.rows} rows${p.keys ? ` keys ${p.keys}` : ""}${p.checked ? ` ${p.checked} preselected` : ""}`).join(", ");
      console.log(`${bad ? "FAIL" : "ok  "} ${path.basename(file)} @${label}: black ${perFrame} | nav ${nav}${pick ? ` | pass reasons ${pick}` : ""}`
        + `${r.strays.length ? ` black-outside-frames=${JSON.stringify(r.strays)}` : ""}`
        + `${r.modeSwitch || modeText.length ? ` MODE-SWITCH=${r.modeSwitch} ${JSON.stringify(modeText)}` : ""}`
        + `${glyphs.length ? ` glyphs=${JSON.stringify(glyphs)}` : ""}${foreign.length ? ` not-in-deck=${JSON.stringify(foreign)}` : ""}`
        + `${r.moneySans.length ? ` money-figures-not-mono=${JSON.stringify(r.moneySans)}` : ""}`
        + `${r.sansDates.length ? ` dates-not-mono=${JSON.stringify(r.sansDates)}` : ""}`
        + `${r.small.length ? ` under-12px=${JSON.stringify(r.small)}` : ""}${r.inputs.length ? ` phone-inputs-under-16px=${JSON.stringify(r.inputs)}` : ""}`
        + `${r.clipped.length ? ` clipped=${JSON.stringify(r.clipped)}` : ""}${r.lowContrast.length ? ` low-contrast=${JSON.stringify(r.lowContrast)}` : ""}`
        + `${r.blue.length ? ` blue-outside-verified=${JSON.stringify(r.blue)}` : ""}`
        + `${label === "mobile" && r.smallTargets.length ? ` small-targets=${JSON.stringify(r.smallTargets)}` : ""}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
