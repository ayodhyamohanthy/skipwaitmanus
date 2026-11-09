#!/usr/bin/env node
/**
 * PROCESS-id-check (D-166, docs/plans/PROCESS-gates.md): a decision ID or a deploy migration
 * number never lands twice. On Oct 23 D-155/D-156 collided twice and 0108 three times; the
 * migration lint checks uniqueness inside one tree, never against main.
 *
 *   node scripts/decision-id-check.mjs     # check the current head against origin/main
 *
 * In CI it runs from `scripts/scope-check.mjs` after the review gate, on pull requests only.
 * It reads the `| D-NNN |` IDs that open table rows in docs/DECISIONS.md on the PR head, on
 * origin/main and on their merge base, and fails when:
 *   1. the head has an ID twice;
 *   2. an ID the branch adds (absent at the merge base) is on origin/main with different text in
 *      its first 120 characters (a collision, not the same row merged twice);
 *   3. a new `drizzle/deploy/NNNN_*.sql` (absent at the merge base) uses a number origin/main
 *      already has under another file name.
 * Each failure names the next free ID or number. Like the other gates it fails open, loudly,
 * only on its own internal error (no git, no merge base, an unreadable file).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DECISIONS = "docs/DECISIONS.md";
const DEPLOY_DIR = "drizzle/deploy";
const SAME_ROW_PREFIX = 120;
const ROW_ID = /^\| (D-(\d+)) \|/;
const MIGRATION = /(?:^|\/)(\d{4})_[^/]*\.sql$/;
const SHA = /^[0-9a-f]{40}$/;
const git = args => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();

/** The decision rows of a register: every line that opens with `| D-NNN |`, oldest first. */
export function decisionRows(text) {
  return String(text ?? "").split("\n").flatMap(line => {
    const m = ROW_ID.exec(line);
    return m ? [{ id: m[1], num: Number(m[2]), prefix: line.slice(0, SAME_ROW_PREFIX) }] : [];
  });
}

const migrationsOf = paths => (Array.isArray(paths) ? paths : []).flatMap(path => {
  const m = MIGRATION.exec(String(path));
  return m ? [{ path: String(path), name: String(path).split("/").at(-1), num: Number(m[1]) }] : [];
});

const maxOf = nums => nums.reduce((max, n) => (n > max ? n : max), 0);
const decisionId = n => `D-${String(n).padStart(3, "0")}`;
const migrationNumber = n => String(n).padStart(4, "0");

/**
 * The rules, with no I/O. `head`, `main` and `base` are docs/DECISIONS.md texts; the migration
 * lists are paths (or file names) under drizzle/deploy/. Returns the violations, empty to pass.
 */
export function decisionIdViolations({ head = "", main = "", base = "", headMigrations = [], mainMigrations = [], baseMigrations = [] } = {}) {
  const violations = [];
  const headRows = decisionRows(head);
  const mainRows = decisionRows(main);
  const baseIds = new Set(decisionRows(base).map(r => r.id));
  const nextId = decisionId(maxOf([...mainRows, ...headRows].map(r => r.num)) + 1);

  const counts = new Map();
  for (const r of headRows) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
  for (const [id, count] of counts) {
    if (count > 1) violations.push(`${id} appears ${count} times in ${DECISIONS} on this head. Renumber the newer row to the next free ID, ${nextId} (highest on origin/main + 1).`);
  }

  const mainById = new Map(mainRows.map(r => [r.id, r]));
  const added = new Set();
  for (const r of headRows) {
    if (baseIds.has(r.id) || added.has(r.id)) continue;
    added.add(r.id);
    const onMain = mainById.get(r.id);
    if (onMain && onMain.prefix !== r.prefix) violations.push(`${r.id} is already used on origin/main by a different decision (a collision). Renumber this branch's row to the next free ID, ${nextId}.`);
  }

  const headM = migrationsOf(headMigrations);
  const mainM = migrationsOf(mainMigrations);
  const baseNames = new Set(migrationsOf(baseMigrations).map(m => m.name));
  const nextMigration = migrationNumber(maxOf([...mainM, ...headM].map(m => m.num)) + 1);
  for (const m of headM) {
    if (baseNames.has(m.name)) continue;
    const taken = mainM.find(other => other.num === m.num && other.name !== m.name);
    if (taken) violations.push(`${DEPLOY_DIR}/${m.name}: migration number ${migrationNumber(m.num)} is already used on origin/main by ${taken.name}. Use the next free number, ${nextMigration} (and record it in plan §5).`);
  }
  return violations;
}

function pullRequestHead() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;
  const sha = JSON.parse(readFileSync(eventPath, "utf8"))?.pull_request?.head?.sha;
  return typeof sha === "string" && SHA.test(sha) ? sha : null;
}

const fileAt = (ref, path) => {
  try { return git(["show", `${ref}:${path}`]); } catch { return ""; }
};
const migrationsAt = ref => git(["ls-tree", "--name-only", `${ref}:${DEPLOY_DIR}`]).split("\n").filter(Boolean);

/**
 * Run the check. From scope-check it runs on pull requests only (`local: false`); run on its own it
 * checks the current head, so a session can see the answer before it pushes.
 */
export function runDecisionIdCheck({ local = false } = {}) {
  try {
    const eventName = process.env.GITHUB_EVENT_NAME;
    if (!local && eventName !== "pull_request") return 0;

    // In CI the checkout is GitHub's merge of the PR into main; the PR's own head is in the event.
    const head = pullRequestHead() ?? git(["rev-parse", "HEAD"]);
    const base = git(["merge-base", "origin/main", head]);
    const violations = decisionIdViolations({
      head: fileAt(head, DECISIONS),
      main: fileAt("origin/main", DECISIONS),
      base: fileAt(base, DECISIONS),
      headMigrations: migrationsAt(head),
      mainMigrations: migrationsAt("origin/main"),
      baseMigrations: migrationsAt(base),
    });
    if (!violations.length) {
      console.log(`decision-id-check: ${head.slice(0, 8)} adds no decision ID or migration number that origin/main already uses.`);
      return 0;
    }
    for (const violation of violations) console.error(`decision-id-check: ${violation}`);
    console.error(`decision-id-check: ${violations.length} violation(s) (D-166).`);
    return 1;
  } catch (error) {
    console.error(`decision-id-check: could not run (${error instanceof Error ? error.message : String(error)}) — not failing the branch.`);
    return 0;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runDecisionIdCheck({ local: true });
}
