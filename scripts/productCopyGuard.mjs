/**
 * Product copy guard: a ratchet on the claims SkipWait is allowed to make.
 *
 * Playbook §1.1 forbids presenting request acceptance as a submitted referral,
 * §4.9 marks interview/offer milestones as self-reported, and §0.3 requires
 * founder approval before publishing employment-outcome claims. Those are
 * copy promises, and prose audits of them go stale the next time someone
 * writes a sentence. This script makes them executable instead: `pnpm test`
 * scans every product surface and fails on a new violation with file:line.
 *
 * Deliberately narrow. It reads English sentences, so code identifiers cannot
 * trip it, and it treats a disclaimer as a disclaimer: "A referral never
 * guarantees an interview" is the honest copy we want, so negated sentences
 * pass. Fixed status labels are pinned by their own unit tests, not here.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Every RULES pattern carries the `g` flag because findingsForContent() iterates
 * exec() until it returns null. Without `g`, exec() always restarts at index 0,
 * so any file containing one match sends the scanner into an infinite loop.
 */
export const RULES = [
  {
    id: "guaranteed-outcome",
    summary: "Promising an interview, offer, or job. Say what is decided and by whom instead.",
    pattern: /\b(?:guarante(?:e|es|ed|ing)|assures? you|promises? (?:you )?(?:an? )?(?:interview|offer|job|hiring)|ensures? (?:an? )?(?:interview|offer|job|hiring))\b/gi,
    allowWhenNegated: true,
  },
  {
    id: "employer-action-claimed",
    summary: "Claiming the employer received something. SkipWait cannot observe employer systems.",
    pattern: /\b(?:referrals? (?:was|were|has been|have been|is being|will be) (?:submitted|forwarded|sent)|applications? (?:was|were|has been|have been|is being|will be) (?:submitted|forwarded|sent)|we (?:have|’)ve (?:sent|submitted|forwarded|shared) your (?:referral|application)|your partner (?:has|’)ve (?:sent|submitted|forwarded|shared) your (?:referral|application)|employer has been (?:notified|told|sent)|you (?:were|’ve been|have been) referred to the employer)\b/gi,
    allowWhenNegated: true,
  },
  {
    id: "unverified-milestone-stated-as-fact",
    summary: "Stating an introduction, interview, offer, or hire as confirmed. These are participant reports.",
    pattern: /\b(?:introduction|interview|offer|hire|hired|referral) (?:was|were|has been|have been|is|got) (?:recorded|confirmed|received|verified|completed|made)\b/gi,
    allowWhenNegated: true,
  },
  {
    id: "outcome-statistics-claim",
    summary: "Publishing a hiring or response rate. Needs measured evidence and founder approval (§0.3).",
    pattern: /\b(?:\d{1,3}%\s*(?:hire|hiring|offer|interview|success|response|placement)[-\s]*(?:rate|rate:)?|placement rate|offer-to-hire ratio|\d+(?:\.\d+)?x more likely to be (?:hired|interviewed))\b/gi,
    allowWhenNegated: false,
  },
];

/**
 * `no\b` does not match "Nobody", and a claim is usually disclaimed by the
 * sentence that follows it rather than the one containing it: "A guaranteed
 * interview, or a stated success rate for an individual application. Nobody can
 * promise either." sentenceAround() already spans both sentences, so the
 * disclaimer is in view — the vocabulary was simply missing.
 *
 * Only promise-disclaiming forms are added. A bare "nobody"/"nothing" would gut
 * the rule: "We guarantee an interview. Nobody pays a fee." must still fail.
 */
const NEGATION = /\b(?:not|never|no\b|without|cannot|can’t|can't|neither|disclaims?|avoids?)\b|(?:nobody|no one|no-one|nothing)\s+(?:can|could|will|would)\s+(?:promise|guarantee|assure|ensure)|(?:cannot|can’t|can't|won’t|will not)\s+be\s+(?:promised|guaranteed|assured|ensured)|(?:is|are|was|were)\s+not\s+guaranteed/i;
const SENTENCE_BOUNDARY = /[.!?\n;]|\u2014/g;
const SCANNED_DIRS = ["client/src", "shared", "server"];
const TEST_FILE = /\.(?:test|spec)\.[cm]?tsx?$/;
const PRODUCT_FILE = /\.(?:tsx?|jsx?)$/;

/**
 * Product copy lives in strings and JSX text, not in comments: an engineer
 * writing "guarantees a minimum delay" in a code comment is not a promise the
 * product makes. Comments are blanked to spaces rather than removed so every
 * match keeps its original offset, line number and sentence boundaries.
 * String and template literals are walked so a `//` inside copy is not read as
 * a comment opener.
 */
export function blankComments(content) {
  const out = content.split("");
  let state = "code";
  for (let i = 0; i < out.length; i += 1) {
    const char = out[i];
    const next = out[i + 1];
    if (state === "line") { if (char === "\n") state = "code"; else if (char !== "\r") out[i] = " "; continue; }
    if (state === "block") { if (char === "*" && next === "/") { out[i] = " "; out[i + 1] = " "; i += 1; state = "code"; } else if (char !== "\n") out[i] = " "; continue; }
    if (state === "single" || state === "double" || state === "template") {
      const closer = state === "single" ? "'" : state === "double" ? '"' : "`";
      if (char === "\\") { i += 1; continue; }
      if (char === closer) state = "code";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") { state = char === "'" ? "single" : char === '"' ? "double" : "template"; continue; }
    if (char === "/" && next === "/") { out[i] = " "; out[i + 1] = " "; i += 1; state = "line"; continue; }
    if (char === "/" && next === "*") { out[i] = " "; out[i + 1] = " "; i += 1; state = "block"; continue; }
  }
  return out.join("");
}

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stats;
    try { stats = statSync(full); } catch { continue; }
    if (stats.isDirectory()) yield* walk(full);
    else if (PRODUCT_FILE.test(entry) && !TEST_FILE.test(entry)) yield full;
  }
}

export function collectProductFiles(rootDir) {
  const found = [];
  for (const dir of SCANNED_DIRS) for (const file of walk(join(rootDir, dir))) found.push(relative(rootDir, file).split(sep).join("/"));
  return found.sort();
}

/** The sentence containing `index` and the sentence after it. */
function sentenceAround(content, index) {
  SENTENCE_BOUNDARY.lastIndex = 0;
  let start = 0;
  let match = SENTENCE_BOUNDARY.exec(content);
  while (match && match.index < index) { start = match.index + 1; match = SENTENCE_BOUNDARY.exec(content); }
  const next = SENTENCE_BOUNDARY.exec(content);
  return content.slice(start, next ? next.index : content.length);
}

export function findingsForContent(file, rawContent) {
  const content = blankComments(rawContent);
  const findings = [];
  const lineStarts = [0];
  for (let i = 0; i < content.length; i += 1) if (content[i] === "\n") lineStarts.push(i + 1);
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let match = rule.pattern.exec(content);
    while (match) {
      const sentence = sentenceAround(content, match.index);
      if (!(rule.allowWhenNegated && NEGATION.test(sentence))) {
        const line = lineStarts.filter(start => start <= match.index).length;
        findings.push({ file, line, ruleId: rule.id, excerpt: sentence.trim().replace(/\s+/g, " ").slice(0, 240), why: rule.summary });
      }
      match = rule.pattern.exec(content);
    }
  }
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

export function scanProductCopy(rootDir, files = collectProductFiles(rootDir)) {
  const findings = [];
  for (const file of files) findings.push(...findingsForContent(file, readFileSync(join(rootDir, file), "utf8")));
  return findings;
}

function format(findings) {
  if (!findings.length) return `product-copy-guard: ${collectProductFiles(process.cwd()).length} files scanned · no rule violations.\n`;
  const lines = findings.map(f => `  ${f.file}:${f.line}  [${f.ruleId}]  ${f.excerpt}`);
  return `product-copy-guard: ${findings.length} violation(s)\n${lines.join("\n")}\n\nWhy each rule exists:\n${RULES.map(r => `  ${r.id} — ${r.summary}`).join("\n")}\n`;
}

if (process.argv[1] && process.argv[1].endsWith("productCopyGuard.mjs")) {
  const findings = scanProductCopy(process.cwd());
  process.stdout.write(format(findings));
  process.exit(findings.length ? 1 : 0);
}
