/**
 * Pure rules for scripts/design-token-audit.mjs (DESIGN.md "Verification"; packet docs/plans/D-048-phase-2.md §6a).
 *
 * Two surfaces live side by side until every screen has moved to the goal UI (D-048, D-071):
 * - Unmoved (Kit v4) files: only the approved hexes below may appear as Tailwind arbitrary colours.
 * - Goal scope (client/src/components/goal/**, client/src/pages/goal/**): no colour literal at all, no Kit v4 or
 *   shadcn tokens, no banned effects; trust blue only in GoalVerifiedMark; status hues only in the primitives.
 * The goal tokens in client/src/index.css must equal GOAL_TOKENS, which mirror design/goal-ui/pick/tokens.css.
 */

export const GOAL_SCOPE = [/^client\/src\/components\/goal\//, /^client\/src\/pages\/goal\//, /^client\/src\/components\/AppShell\.tsx$/];
export const isGoalFile = file => GOAL_SCOPE.some(pattern => pattern.test(file));

/** Kit v4 palette + legacy palette, accepted only in files that have not moved to the goal UI. */
export const APPROVED = new Set([
  "#ffffff", "#000000", "#141414", "#0000ff", "#0000cc", "#000099", "#ededff", "#c2c2ff", "#e0e0ff", "#fffc52", "#121212",
  "#505050", "#767676", "#e5e5e5", "#cfcfcf", "#f0f0f0", "#f5f5f5", "#e0e0e0", "#15803d", "#b45309", "#b91c1c",
]);
/** Deliberate third-party brand colours (share targets). */
export const THIRD_PARTY = new Set(["#25d366", "#229ed9", "#0a66c2"]);

/** Expected goal tokens in client/src/index.css (DESIGN.md tables). A change here needs the owner (DESIGN.md binding rules). */
export const GOAL_TOKENS = Object.freeze({
  "--g-canvas": "#ffffff", "--g-surface": "#ffffff", "--g-surface-sunken": "#fafafa", "--g-surface-hover": "#f4f4f5",
  "--g-surface-selected": "#f4f4f5", "--g-scrim": "rgb(10 10 10 / 0.24)", "--g-ink": "#0a0a0a", "--g-ink-2": "#52525b",
  "--g-ink-3": "#6b6b73", "--g-ink-inverse": "#ffffff", "--g-hairline": "#ebebeb", "--g-control-edge": "#8a8a8a",
  "--g-primary": "#0a0a0a", "--g-primary-hover": "#262626", "--g-primary-pressed": "#404040", "--g-on-primary": "#ffffff",
  "--g-on-primary-edge": "rgb(255 255 255 / 0.4)", "--g-trust": "#1d4ed8", "--g-emerald": "#047857", "--g-amber": "#b45309",
  "--g-crimson": "#b91c1c", "--g-dot": "8px", "--g-font-sans": '"Instrument Sans", system-ui, sans-serif',
  "--g-font-mono": '"JetBrains Mono", ui-monospace, monospace',
  "--g-shadow-popover": "0 0 0 1px rgb(0 0 0 / 0.08), 0 1px 1px rgb(0 0 0 / 0.02), 0 4px 8px -4px rgb(0 0 0 / 0.04), 0 16px 24px -8px rgb(0 0 0 / 0.06)",
  "--g-shadow-drawer": "-1px 0 0 var(--g-hairline), -16px 0 32px -24px rgb(0 0 0 / 0.16)",
  "--g-focus-ring": "0 0 0 2px var(--g-surface), 0 0 0 4px var(--g-ink)",
  "--g-dur-list": "0ms", "--g-dur-hover": "100ms", "--g-dur-menu": "150ms", "--g-dur-drawer-in": "200ms", "--g-dur-drawer-out": "200ms",
  "--g-ease-out": "cubic-bezier(0, 0, 0.2, 1)", "--g-ease-in": "cubic-bezier(0.4, 0, 1, 1)",
  "--g-rail-w": "104px", "--g-rail-tile-w": "88px", "--g-rail-tile-h": "56px", "--g-topbar-h": "56px", "--g-bottombar-h": "56px",
  "--g-drawer-w": "480px", "--g-list-w": "360px", "--g-detail-max": "680px", "--g-asks-list-w": "440px", "--g-decision-bar-h": "72px",
  "--g-subheader-h-phone": "48px", "--g-control-h": "40px", "--g-control-h-phone": "48px", "--g-touch": "44px",
});

/** Where a goal token deliberately differs from its comp source (--sw-* in design/goal-ui/pick/tokens.css). */
export const COMP_DEVIATIONS = Object.freeze({
  "--g-dur-drawer-out": "AGENTS.md §0a: drawers 200-300ms (D-077(1)); the comp says 150ms",
  "--g-on-primary-edge": "comes from shell.css (.btn--primary .kbd), not tokens.css",
  "--g-shadow-drawer": "uses var(--g-hairline) for the identical #EBEBEB literal",
  "--g-focus-ring": "uses var(--g-surface)/var(--g-ink) for the identical literals",
});

const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(/g;
const KIT_TOKEN = /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|outline|fill|stroke|divide|placeholder|caret|decoration|accent|shadow)-(?:primary-foreground|primary|secondary|muted-foreground|muted|accent|destructive|border|input|ring|background|foreground|card|popover|sidebar[a-z-]*|chart-[1-5]|ink-soft|ink|coal|paper|signal-tint|signal-line|signal|fog|faint|line)(?![\w-])/g;
const KIT_SHAPE = /(?<![\w-])(?:[a-z-]+:)*(?:rounded(?:-[trbl]{1,2})?-(?:sm|md|lg|xl|2xl|3xl|4xl)|font-mono|brand-button|animate-(?:in|out)|(?:fade|zoom|slide)-(?:in|out))(?![\w-])/g;
const KIT_BREAKPOINT = /(?<![\w-])(?:max-)?(?:sm|md|lg|xl|2xl):(?=[\w[!@-])/g;
const BANNED_EFFECT = /(?<![\w-])(?:[a-z-]+:)*(?:bg-gradient-|bg-linear-|bg-radial-|bg-conic-|backdrop-|blur-|drop-shadow|shadow-\[|animate-(?:pulse|spin|bounce|ping)\b|aria-disabled:opacity-|disabled:opacity-)/g;
const STATUS_HUE = /\bg-(?:emerald|amber|crimson)\b/g;
const TRUST = /\bg-trust\b/g;

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

/** Blank out comments (keeping line breaks and offsets), so "PR #316" or a note that something is NOT shown never
 * reads as a colour or a field. Strings and JSX text are kept; a URL's "//" inside a string is left alone. */
export function stripComments(source) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];
    if (quote) {
      out += char;
      if (char === "\\") { out += next ?? ""; i += 2; continue; }
      if (char === quote) quote = null;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; out += char; i += 1; continue; }
    if (char === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") { out += " "; i += 1; }
      continue;
    }
    if (char === "/" && next === "*") {
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) { out += source[i] === "\n" ? "\n" : " "; i += 1; }
      out += "  ";
      i += 2;
      continue;
    }
    out += char;
    i += 1;
  }
  return out;
}
function* matches(source, regex) {
  regex.lastIndex = 0;
  for (let match = regex.exec(source); match; match = regex.exec(source)) yield match;
}

/**
 * @param {{ path: string, source: string }[]} files  repo-relative paths (forward slashes), non-test .ts/.tsx
 * @param {{ sampleNames?: string[] }} [options]      comp fixture names that must never ship
 */
export function auditFiles(files, { sampleNames = [] } = {}) {
  const findings = [];
  let approved = 0;
  let thirdParty = 0;
  const add = (file, source, index, rule, detail) => findings.push({ file, line: lineOf(source, index), rule, detail });
  for (const { path: file, source } of files) {
    for (const name of sampleNames) {
      const index = source.indexOf(name);
      if (index >= 0) add(file, source, index, "R6", `comp sample data "${name}" never ships`);
    }
    if (isGoalFile(file)) {
      const code = stripComments(source);
      for (const match of matches(code, COLOUR_LITERAL)) add(file, source, match.index, "R1", `colour literal ${match[0]} (use a g- token)`);
      for (const match of matches(source, KIT_TOKEN)) add(file, source, match.index, "R4", `Kit v4 / shadcn token ${match[0]}`);
      for (const match of matches(source, KIT_SHAPE)) add(file, source, match.index, "R4", `Kit v4 / shadcn class ${match[0]}`);
      for (const match of matches(source, KIT_BREAKPOINT)) add(file, source, match.index, "R4", `breakpoint ${match[0]} (goal UI uses gdesk: / max-gdesk:)`);
      for (const match of matches(source, BANNED_EFFECT)) add(file, source, match.index, "R5", `banned effect ${match[0]}`);
      if (/\bcompensation\b/i.test(code)) add(file, source, code.search(/\bcompensation\b/i), "R6", 'no compensation field (D-071)');
    } else {
      const tokens = source.match(/[a-z-]*\[#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})\](?:\/[0-9]{1,3})?/g) ?? [];
      for (const token of tokens) {
        const hex = token.match(/#[0-9A-Fa-f]{3,6}/)[0].toLowerCase();
        if (APPROVED.has(hex)) approved++;
        else if (THIRD_PARTY.has(hex)) thirdParty++;
        else add(file, source, source.indexOf(token), "A1", `off-brand token ${token}`);
      }
    }
    if (file !== "client/src/components/goal/GoalVerifiedMark.tsx") {
      for (const match of matches(source, TRUST)) add(file, source, match.index, "R2", "trust blue appears only in GoalVerifiedMark");
    }
    if (!file.startsWith("client/src/components/goal/")) {
      for (const match of matches(source, STATUS_HUE)) add(file, source, match.index, "R3", `${match[0]} belongs to a goal primitive; pass a status kind`);
    }
  }
  return { findings, approved, thirdParty };
}

/** Parse `--g-name: value;` declarations from the goal block's :root in index.css. */
export function readGoalTokens(css) {
  const block = css.slice(css.indexOf("===== D-048 phase 2"));
  const root = block.match(/:root\s*\{([\s\S]*?)\n\}/);
  const tokens = {};
  if (!root) return tokens;
  for (const match of root[1].matchAll(/(--g-[a-z0-9-]+)\s*:\s*([^;]+);/g)) tokens[match[1]] = match[2].trim();
  return tokens;
}

/** R7 (token drift) and R8 (CSS files). */
export function auditGoalTokens({ indexCss, compTokensCss, cssFiles }) {
  const findings = [];
  const actual = readGoalTokens(indexCss);
  for (const [name, value] of Object.entries(GOAL_TOKENS)) {
    if (!(name in actual)) findings.push({ rule: "R7", detail: `${name} is missing from client/src/index.css` });
    else if (actual[name] !== value) findings.push({ rule: "R7", detail: `${name} is "${actual[name]}", DESIGN.md says "${value}"` });
  }
  for (const name of Object.keys(actual)) if (!(name in GOAL_TOKENS)) findings.push({ rule: "R7", detail: `${name} is not in DESIGN.md` });
  if (compTokensCss) {
    // Base values only: the comp's reduced-motion block re-declares the durations as 0ms inside @media.
    const base = compTokensCss.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    for (const match of base.matchAll(/--sw-([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      const name = `--g-${match[1]}`;
      if (!(name in GOAL_TOKENS) || name in COMP_DEVIATIONS) continue;
      const comp = match[2].trim().toLowerCase().replace(/\s+/g, " ");
      if (comp !== GOAL_TOKENS[name].toLowerCase()) findings.push({ rule: "R7", detail: `${name} differs from the approved comp (${comp}) without a recorded deviation` });
    }
  }
  const allowedCss = new Set(["client/src/index.css", "client/src/styles/kit.css"]);
  for (const file of cssFiles) {
    if (!allowedCss.has(file.path)) findings.push({ rule: "R8", detail: `${file.path}: only index.css and styles/kit.css may exist under client/src` });
    else if (file.path !== "client/src/index.css" && /--g-[a-z]/.test(file.source)) findings.push({ rule: "R8", detail: `${file.path}: --g- tokens live only in index.css` });
  }
  return findings;
}
