// Shared helpers for the "your pick" comps (D-070: Triage Desk's layout, Signal's type).
// Copied from triage-desk/src/lib.mjs; the one addition is the shipped-copy overlay below.
// Every visible string comes from ../../content.json (or, where it lags what shipped, from the
// overlay, which says so on every run) and every icon from ../../tools/lucide.mjs, so the comps
// cannot drift from the shared copy deck, the product or the lucide set.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SHIPPED_PASS_REASONS } from "./passReasons.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DIRECTION_DIR = path.resolve(here, "..");
const GOAL_UI = path.resolve(here, "../..");

const deck = JSON.parse(fs.readFileSync(path.join(GOAL_UI, "content.json"), "utf8"));

/**
 * Shipped copy newer than content.json, drawn in its place and announced by build.mjs and gate.mjs.
 * Each entry turns itself off once content.json matches what shipped.
 */
export const OVERLAYS = [];
const pass = deck.screenB.detail.pass;
const passMatches = pass.reasons.length === SHIPPED_PASS_REASONS.length
  && pass.reasons.every((r, i) => r.code === SHIPPED_PASS_REASONS[i].code && r.label === SHIPPED_PASS_REASONS[i].label);
if (!passMatches) {
  const n = SHIPPED_PASS_REASONS.length;
  OVERLAYS.push(`screenB.detail.pass.reasons: content.json lists ${pass.reasons.length}; drawing the ${n} shipped in `
    + `shared/passReasons.ts (D-052, ebf6a8f4) with keys 1-${n}. Update content.json and BRIEF.md 3.1 rule 9 to match; `
    + "this overlay then does nothing.");
  pass.reasons = SHIPPED_PASS_REASONS.map((r, i) => ({ ...r, key: String(i + 1) }));
}

export const C = deck;
export const FONTS_CSS = "../tools/fonts.css"; // relative to pick/*.html, so the comps open from any checkout
const LUCIDE = path.join(GOAL_UI, "tools/lucide.mjs");

const svgCache = new Map();
/** Inline lucide SVG, exactly as tools/lucide.mjs prints it. */
export function icon(name, size = 16, stroke = 2) {
  const key = `${name}|${size}|${stroke}`;
  if (!svgCache.has(key)) {
    const out = execFileSync("node", [LUCIDE, name, "--size", String(size), "--stroke", String(stroke)], { encoding: "utf8" });
    svgCache.set(key, out.trim());
  }
  return svgCache.get(key);
}

export const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
const DATE_RE = new RegExp(`\\b\\d{1,2} ${MONTH}\\b`, "g");
const DATA_RE = new RegExp(`\\b\\d{1,2} ${MONTH}\\b|\\d+`, "g");
const wrapMono = (m) => `<span class="mono">${m}</span>`;

/** Whole value in the mono data face (IDs, clocks, counters, dates). */
export const mono = (s) => wrapMono(esc(s));
/** Prose: only the dates (D MMM) switch to mono. */
export const dates = (s) => esc(s).replace(DATE_RE, wrapMono);
/** Short data lines: dates and every numeral switch to mono. */
export const data = (s) => esc(s).replace(DATA_RE, wrapMono);
/** Typesetting: a short closing sentence (up to three words) stays on one line ("Never your name."). */
export const bindTail = (s) => esc(s).replace(/(?<=[.!?] )(?:\S+ ){0,2}\S+$/, (m) => m.replace(/ /g, "&nbsp;"));
/** Keycap: a letter, or a lucide icon passed in as markup. */
export const kbd = (inner) => `<kbd class="kbd">${inner}</kbd>`;
/** Two-digit index for numbered reasons (01, 02, 03). */
export const nn = (n) => String(n).padStart(2, "0");
