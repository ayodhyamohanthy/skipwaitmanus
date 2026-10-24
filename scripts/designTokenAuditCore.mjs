/**
 * Pure design-token audit core (D-048 phase 2). The CLI wrapper
 * (scripts/design-token-audit.mjs) gathers files; this module owns the rules
 * so fixtures can exercise them directly (scripts/designTokenAudit.test.ts).
 *
 * Live (non-goal) files: unchanged Kit v4 migration-union hex check.
 * Goal scope (client/src/components/goal/**, including the dev gallery):
 * the phase-2 rules A2/R1-R6 below. CSS checks (A3/R7/R8) run on the CSS
 * file list passed in opts.
 */

export const APPROVED = new Set([
  "#ffffff", "#000000",
  "#141414",
  "#0000ff", "#0000cc", "#000099",
  "#ededff", "#c2c2ff", "#e0e0ff",
  "#fffc52", "#121212",
  "#505050", "#767676", "#e5e5e5", "#cfcfcf", "#f0f0f0", "#f5f5f5", "#e0e0e0",
  "#15803d", "#b45309", "#b91c1c",
]);

export const THIRD_PARTY = new Set(["#25d366", "#229ed9", "#0a66c2"]);

export const GOAL_SCOPE = /^client\/src\/(components\/goal|pages\/goal)\//;
export const GOAL_VERIFIED_MARK = "client/src/components/goal/GoalVerifiedMark.tsx";
const GOAL_POST_OPPORTUNITY = "client/src/pages/goal/post-opportunity/";
export const INDEX_CSS = "client/src/index.css";
export const ALLOWED_CSS_FILES = new Set([INDEX_CSS, "client/src/styles/kit.css"]);
export const GOAL_BLOCK_MARKER = "D-048 phase 2 · goal-UI tokens";

/** A3: the only hex literals the phase-2 block may carry. */
export const GOAL_BLOCK_HEXES = new Set([
  "#ffffff", "#fafafa", "#f4f4f5", "#0a0a0a", "#52525b", "#6b6b73", "#ebebeb",
  "#8a8a8a", "#262626", "#404040", "#1d4ed8", "#047857", "#b45309", "#b91c1c",
  // D-130: warm hero band (landing only) + V6-B mark values.
  "#fce9da", "#f6cfdd", "#e7d6f4", "#c9c9c9",
]);

/** R7: the expected @theme entries of the phase-2 block (name -> normalized value). */
export const G_THEME = {
  "--color-g-canvas": "var(--g-canvas)", "--color-g-surface": "var(--g-surface)",
  "--color-g-surface-sunken": "var(--g-surface-sunken)", "--color-g-surface-hover": "var(--g-surface-hover)",
  "--color-g-surface-selected": "var(--g-surface-selected)", "--color-g-scrim": "var(--g-scrim)",
  "--color-g-ink": "var(--g-ink)", "--color-g-ink-2": "var(--g-ink-2)", "--color-g-ink-3": "var(--g-ink-3)", "--color-g-ink-inverse": "var(--g-ink-inverse)",
  "--color-g-hairline": "var(--g-hairline)", "--color-g-control-edge": "var(--g-control-edge)",
  "--color-g-primary": "var(--g-primary)", "--color-g-primary-hover": "var(--g-primary-hover)", "--color-g-primary-pressed": "var(--g-primary-pressed)",
  "--color-g-on-primary": "var(--g-on-primary)", "--color-g-on-primary-edge": "var(--g-on-primary-edge)",
  "--color-g-trust": "var(--g-trust)", "--color-g-emerald": "var(--g-emerald)", "--color-g-amber": "var(--g-amber)", "--color-g-crimson": "var(--g-crimson)",
  "--font-g-sans": "var(--g-font-sans)", "--font-g-mono": "var(--g-font-mono)",
  "--text-g-display": "28px", "--text-g-display--line-height": "36px", "--text-g-display--font-weight": "700", "--text-g-display--letter-spacing": "-0.02em",
  "--text-g-heading": "20px", "--text-g-heading--line-height": "28px", "--text-g-heading--font-weight": "600", "--text-g-heading--letter-spacing": "-0.01em",
  "--text-g-body": "16px", "--text-g-body--line-height": "24px", "--text-g-body--font-weight": "400", "--text-g-body--letter-spacing": "0",
  "--text-g-label": "14px", "--text-g-label--line-height": "20px", "--text-g-label--font-weight": "600", "--text-g-label--letter-spacing": "0.01em",
  "--text-g-meta": "13px", "--text-g-meta--line-height": "20px", "--text-g-meta--font-weight": "500", "--text-g-meta--letter-spacing": "0.01em",
  "--text-g-badge": "12px", "--text-g-badge--line-height": "16px", "--text-g-badge--font-weight": "500", "--text-g-badge--letter-spacing": "0.02em",
  "--text-g-mono": "13px", "--text-g-mono--line-height": "20px", "--text-g-mono--font-weight": "500", "--text-g-mono--letter-spacing": "0",
  "--text-g-row-phone": "16px", "--text-g-row-phone--line-height": "24px", "--text-g-row-phone--font-weight": "600", "--text-g-row-phone--letter-spacing": "0",
  "--radius-g-keycap": "4px", "--radius-g-control": "6px", "--radius-g-tile": "8px", "--radius-g-popover": "12px", "--radius-g-sheet": "12px",
  "--shadow-g-popover": "var(--g-shadow-popover)", "--shadow-g-drawer": "var(--g-shadow-drawer)", "--shadow-g-focus": "var(--g-focus-ring)",
  "--ease-g-out": "cubic-bezier(0, 0, 0.2, 1)", "--ease-g-in": "cubic-bezier(0.4, 0, 1, 1)",
  "--breakpoint-gdesk": "40.0625rem",
  "--animate-g-drawer-in": "g-drawer-in var(--g-dur-drawer-in) var(--g-ease-out) both",
  "--animate-g-drawer-out": "g-drawer-out var(--g-dur-drawer-out) var(--g-ease-in) both",
  "--animate-g-sheet-in": "g-sheet-in var(--g-dur-drawer-in) var(--g-ease-out) both",
  "--animate-g-sheet-out": "g-sheet-out var(--g-dur-drawer-out) var(--g-ease-in) both",
  "--animate-g-fade-in": "g-fade-in var(--g-dur-menu) var(--g-ease-out) both",
  "--animate-g-fade-out": "g-fade-out var(--g-dur-menu) var(--g-ease-in) both",
};

/** R7: the expected :root --g-* declarations of the phase-2 block. */
export const G_VARS = {
  "--g-canvas": "#ffffff", "--g-surface": "#ffffff", "--g-surface-sunken": "#fafafa", "--g-surface-hover": "#f4f4f5", "--g-surface-selected": "#f4f4f5",
  "--g-scrim": "rgb(10 10 10 / 0.24)",
  "--g-ink": "#0a0a0a", "--g-ink-2": "#52525b", "--g-ink-3": "#6b6b73", "--g-ink-inverse": "#ffffff",
  "--g-hairline": "#ebebeb", "--g-control-edge": "#8a8a8a",
  "--g-primary": "#0a0a0a", "--g-primary-hover": "#262626", "--g-primary-pressed": "#404040", "--g-on-primary": "#ffffff", "--g-on-primary-edge": "rgb(255 255 255 / 0.4)",
  "--g-trust": "#1d4ed8", "--g-emerald": "#047857", "--g-amber": "#b45309", "--g-crimson": "#b91c1c",
  "--g-dot": "8px",
  "--g-font-sans": '"Instrument Sans", system-ui, sans-serif', "--g-font-mono": '"JetBrains Mono", ui-monospace, monospace',
  "--g-shadow-popover": "0 0 0 1px rgb(0 0 0 / 0.08), 0 1px 1px rgb(0 0 0 / 0.02), 0 4px 8px -4px rgb(0 0 0 / 0.04), 0 16px 24px -8px rgb(0 0 0 / 0.06)",
  "--g-shadow-drawer": "-1px 0 0 var(--g-hairline), -16px 0 32px -24px rgb(0 0 0 / 0.16)",
  "--g-focus-ring": "0 0 0 2px var(--g-surface), 0 0 0 4px var(--g-ink)",
  "--g-dur-list": "0ms", "--g-dur-hover": "100ms", "--g-dur-menu": "150ms", "--g-dur-drawer-in": "200ms", "--g-dur-drawer-out": "200ms",
  "--g-ease-out": "cubic-bezier(0, 0, 0.2, 1)", "--g-ease-in": "cubic-bezier(0.4, 0, 1, 1)",
  "--g-rail-w": "104px", "--g-rail-tile-w": "88px", "--g-rail-tile-h": "56px", "--g-topbar-h": "56px", "--g-bottombar-h": "56px",
  "--g-drawer-w": "480px", "--g-list-w": "360px", "--g-detail-max": "680px", "--g-asks-list-w": "440px",
  "--g-decision-bar-h": "72px", "--g-subheader-h-phone": "48px", "--g-control-h": "40px", "--g-control-h-phone": "48px", "--g-touch": "44px",
  // D-130: warm hero band + V6-B mark (comp record: design/goal-ui/pick/tokens.css).
  "--g-warm-1": "#fce9da", "--g-warm-2": "#f6cfdd", "--g-warm-3": "#e7d6f4",
  "--g-mark-1": "#c9c9c9", "--g-mark-2": "#8a8a8a", "--g-mark-3": "#0a0a0a",
};

const HEX_TOKEN = /[a-z-]*\[#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})\](?:\/[0-9]{1,3})?/g;
const HEX_ANY = /#[0-9A-Fa-f]{3,8}\b/;
const COLOR_FN = /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(/;
const TRUST_USE = /(?<![a-zA-Z0-9])(?:g-trust|--g-trust)\b/;
const STATUS_HUE_USE = /(?<![a-zA-Z0-9])(?:g-emerald|g-amber|g-crimson|--g-emerald|--g-amber|--g-crimson)\b/;
const KIT_TOKEN = new RegExp([
  String.raw`(?:bg|text|border|ring|outline|fill|stroke|divide|placeholder|caret|decoration|accent|shadow)-(?:primary|primary-foreground|secondary|muted|muted-foreground|accent|destructive|border|input|ring|background|foreground|card|popover|sidebar[a-z-]*|chart-[1-5]|ink|ink-soft|coal|paper|signal|signal-tint|signal-line|fog|faint|line)\b`,
  String.raw`rounded-(?:sm|md|lg|xl|2xl|3xl|4xl)\b`,
  String.raw`\bfont-mono\b`,
  String.raw`brand-button`,
  String.raw`\banimate-(?:in|out)\b`,
  String.raw`(?:^|[\s\"'])(?:fade|zoom|slide)-(?:in|out)\b`,
  String.raw`\b(?:sm|md|lg):`,
].join("|"));
const BANNED_EFFECT = /bg-gradient-|bg-linear-|bg-radial-|bg-conic-|backdrop-|blur-|drop-shadow|shadow-\[|animate-(?:pulse|spin|bounce|ping)|aria-disabled:opacity-|disabled:opacity-/;

const normalize = (value) => value.trim().replace(/\s+/g, " ");

function parseDeclarations(source) {
  const declarations = new Map();
  // First occurrence wins: the reduced-motion media query redeclares the
  // duration vars at the end of the block, and R7 pins the :root values.
  for (const match of source.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) {
    if (!declarations.has(match[1])) declarations.set(match[1], normalize(match[2]));
  }
  return declarations;
}

/**
 * @param {{path: string, source: string}[]} files .ts/.tsx non-test sources (already exclusion-filtered for the legacy hex check; R6 re-scans opts.r6Files)
 * @param {{sampleNames?: string[], r6Files?: {path: string, source: string}[], cssFiles?: {path: string, source: string}[]}} opts
 */
export function auditFiles(files, opts = {}) {
  const findings = [];
  let approvedCount = 0;
  let thirdPartyCount = 0;

  for (const { path: file, source } of files) {
    const inGoal = GOAL_SCOPE.test(file);

    // A1: the legacy migration-union hex check, unchanged for every scanned file.
    const tokens = source.match(HEX_TOKEN) ?? [];
    for (const token of tokens) {
      const hex = token.match(/#[0-9A-Fa-f]{3,6}/)[0].toLowerCase();
      if (APPROVED.has(hex)) { approvedCount++; continue; }
      if (THIRD_PARTY.has(hex)) { thirdPartyCount++; continue; }
      findings.push({ file, rule: "palette", token });
    }

    // R2: trust blue belongs to the verified mark only.
    if (file !== GOAL_VERIFIED_MARK && TRUST_USE.test(source)) {
      findings.push({ file, rule: "R2", token: "g-trust outside GoalVerifiedMark" });
    }
    // R3: status hues are goal-internal; live screens never name them.
    if (!inGoal && STATUS_HUE_USE.test(source)) {
      findings.push({ file, rule: "R3", token: "g-emerald/g-amber/g-crimson outside the goal scope" });
    }

    if (inGoal) {
      // R1: no colour literal in goal scope (A2's utilities and var()s are fine).
      if (HEX_ANY.test(source)) findings.push({ file, rule: "R1", token: source.match(HEX_ANY)[0] });
      if (COLOR_FN.test(source)) findings.push({ file, rule: "R1", token: source.match(COLOR_FN)[0] });
      // R4: no kit/shadcn tokens in goal scope.
      const kit = source.match(KIT_TOKEN);
      if (kit) findings.push({ file, rule: "R4", token: kit[0] });
      // R5: banned effects.
      const banned = source.match(BANNED_EFFECT);
      if (banned) findings.push({ file, rule: "R5", token: banned[0] });
      // R6 (goal part): no compensation row (D-071). The exact storage key
      // "bridge-target-compensation" is not a row: it is the draft-handoff
      // contract the live kit /start, /request, /explore and /wall pages
      // already write, and the goal body must read and clear the same key or
      // the draft breaks across flag variants. Renaming a shared key is a
      // cross-surface contract change, so only that exact literal is excused.
      // R6 exception (Oct 23, coordinator): D-071 drops the compensation ROW
      // from the referral-queue comps and defers the "expected compensation"
      // question; it never banned the employer's optional compensation field
      // on /post-opportunity - the POST contract
      // (shared/companyOpportunities.ts) keeps optional compensation and /wall
      // and /jobs display it. The goal post-opportunity surface may therefore
      // carry the field, while the banned queue copy stays rejected
      // everywhere, including inside that surface.
      const withoutStorageKey = source.split("bridge-target-compensation").join("");
      const bannedQueueCopy = /compensation\s*\(recommended\)|recommended\s+compensation|expected\s+compensation/i;
      const hitsR6 = file.startsWith(GOAL_POST_OPPORTUNITY)
        ? bannedQueueCopy.test(withoutStorageKey)
        : /\bcompensation\b/i.test(withoutStorageKey);
      if (hitsR6) findings.push({ file, rule: "R6", token: "compensation" });
    }
  }

  // R6: comp sample data anywhere in client/src (non-test, no exclusions).
  for (const { path: file, source } of opts.r6Files ?? files) {
    for (const name of opts.sampleNames ?? []) {
      if (name && source.includes(name)) findings.push({ file, rule: "R6", token: name });
    }
  }

  // A3/R7/R8: CSS checks.
  const cssFiles = opts.cssFiles ?? [];
  for (const { path: file } of cssFiles) {
    if (!ALLOWED_CSS_FILES.has(file)) findings.push({ file, rule: "R8", token: "unexpected CSS file under client/src" });
  }
  for (const { path: file, source } of cssFiles) {
    if (file !== INDEX_CSS && source.includes("--g-")) findings.push({ file, rule: "R8", token: "--g-* declared outside index.css" });
  }
  const indexCss = cssFiles.find(({ path: file }) => file === INDEX_CSS);
  if (indexCss) {
    const markerCount = indexCss.source.split(GOAL_BLOCK_MARKER).length - 1;
    if (markerCount !== 1) {
      findings.push({ file: INDEX_CSS, rule: "R7", token: `phase-2 marker found ${markerCount} times (expected 1)` });
    } else {
      const block = indexCss.source.slice(indexCss.source.indexOf(GOAL_BLOCK_MARKER));
      // A3: only the approved goal hexes may appear in the block.
      for (const match of block.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)) {
        if (!GOAL_BLOCK_HEXES.has(match[0].toLowerCase())) findings.push({ file: INDEX_CSS, rule: "A3", token: match[0] });
      }
      // R7: the declared custom properties equal the expected tables exactly.
      const declared = parseDeclarations(block);
      const expected = { ...G_THEME, ...G_VARS };
      for (const [name, value] of Object.entries(expected)) {
        if (!declared.has(name)) findings.push({ file: INDEX_CSS, rule: "R7", token: `missing ${name}` });
        else if (declared.get(name) !== normalize(value)) findings.push({ file: INDEX_CSS, rule: "R7", token: `${name}: ${declared.get(name)} (expected ${normalize(value)})` });
      }
      for (const name of declared.keys()) {
        if (!(name in expected) && /^--[a-z-]*g/.test(name)) findings.push({ file: INDEX_CSS, rule: "R7", token: `extra ${name}` });
      }
    }
  }

  return { findings, approvedCount, thirdPartyCount, scannedCount: files.length };
}
