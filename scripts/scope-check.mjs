#!/usr/bin/env node
/**
 * PICKER-owns-scope (docs/plans/PICKER-PARALLEL.md): fail a branch that changed a file
 * its task does not own.
 *
 *   node scripts/scope-check.mjs <task-id>
 *
 * Reads `owns` from `origin/main`'s task list and diffs `origin/main...HEAD`, so it judges
 * what the branch actually changed against what the task declared, not against what the
 * branch says about itself.
 *
 * It fails open (exit 0 with a warning) only on its own internal error — a missing git,
 * an unreadable task list — never on a definite violation: a check that cannot run must
 * not silently pass a real breach, but it also must not block a branch for a broken tool.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ownsEntry, ownsMatches, slugOf } from "./nextTaskCore.mjs";
import { runQueueGate } from "./queue-gate.mjs";

const ASSIGNMENTS = "docs/plans/assignments.json";
const SWITCH_ONLY_LINE_LIMIT = 12;
const TEST_FILE = /\.test\.tsx?$/;
const SERVER_OR_SHARED = /^(shared|server)\//;

const git = args => execFileSync("git", args, { encoding: "utf8" }).trim();

/**
 * The rules, with no I/O, so they can be tested directly.
 * `changed` is every path the branch touched; `editedTests` the ones that are tests;
 * `lineCounts` maps a switch-only owned path to the number of lines the diff touches.
 */
export function scopeViolations({ owns = [], changed = [], packet = null, lineCounts = new Map() }) {
  const violations = [];
  const allowed = path => path === ASSIGNMENTS || (packet !== null && path === packet) || owns.some(entry => ownsMatches(entry, path));
  const ownsSharedOrServer = owns.some(entry => SERVER_OR_SHARED.test(ownsEntry(entry).pattern));

  for (const path of changed) {
    if (allowed(path)) continue;
    if (TEST_FILE.test(path)) violations.push(`${path}: a test file outside this task's owns (a retirement row must name the tests it deletes)`);
    else if (SERVER_OR_SHARED.test(path) && !ownsSharedOrServer) violations.push(`${path}: this task owns nothing under shared/ or server/`);
    else violations.push(`${path}: outside this task's owns`);
  }

  for (const entry of owns) {
    const { pattern, switchOnly } = ownsEntry(entry);
    if (!switchOnly) continue;
    const touched = lineCounts.get(pattern) ?? 0;
    if (touched > SWITCH_ONLY_LINE_LIMIT) violations.push(`${pattern}: a switch-only file changed ${touched} lines (limit ${SWITCH_ONLY_LINE_LIMIT})`);
  }
  return violations;
}

/** Collect what the branch changed, then judge it. Throws only on its own failure. */
export function checkBranch(taskId) {
  const doc = JSON.parse(git(["show", `origin/main:${ASSIGNMENTS}`]));
  const tasks = doc.tasks ?? [];
  // CI has no task id in hand, only the branch: match it by the slug the picker already uses.
  const branch = process.env.GITHUB_HEAD_REF || git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const task = taskId === "--branch" ? tasks.find(t => slugOf(t.branch) === slugOf(branch)) : tasks.find(t => t.id === taskId);
  if (!task) throw new Error(taskId === "--branch" ? `no task in origin/main uses the branch ${branch}` : `task ${taskId} is not in origin/main's task list`);
  const owns = Array.isArray(task.owns) ? task.owns : [];
  if (!owns.length) return { owns, violations: [], skipped: `task ${task.id} declares no owns` };
  const changed = git(["diff", "--name-only", "--no-renames", "origin/main...HEAD"]).split("\n").filter(Boolean);
  const lineCounts = new Map();
  for (const entry of owns) {
    const { pattern, switchOnly } = ownsEntry(entry);
    if (!switchOnly) continue;
    const numstat = git(["diff", "--numstat", "origin/main...HEAD", "--", pattern]).split("\n").filter(Boolean);
    lineCounts.set(pattern, numstat.reduce((sum, row) => sum + row.split("\t").slice(0, 2).reduce((n, cell) => n + (Number(cell) || 0), 0), 0));
  }
  return { owns, violations: scopeViolations({ owns, changed, packet: task.packet, lineCounts }), skipped: null };
}

// PROCESS-review-gate: loaded lazily, so a copy of this script without the gate beside it fails open, loudly.
async function reviewGate() {
  try { return (await import("./review-gate.mjs")).runReviewGate(); }
  catch (error) { console.error(`review-gate: could not load (${error instanceof Error ? error.message : String(error)}) — not failing the branch.`); return 0; }
}

// PROCESS-id-check: the same lazy, fail-open load, after the review gate.
async function idCheck() {
  try { return (await import("./decision-id-check.mjs")).runDecisionIdCheck(); }
  catch (error) { console.error(`decision-id-check: could not load (${error instanceof Error ? error.message : String(error)}) — not failing the branch.`); return 0; }
}

// GATE-test-integrity: the same lazy, fail-open load, after the id check.
async function testIntegrity() {
  try { return (await import("./test-integrity.mjs")).runTestIntegrity(); }
  catch (error) { console.error(`test-integrity: could not load (${error instanceof Error ? error.message : String(error)}) — not failing the branch.`); return 0; }
}

async function main() {
  const queueGateExit = runQueueGate();
  if (queueGateExit !== 0) return queueGateExit;
  const reviewGateExit = await reviewGate();
  if (reviewGateExit !== 0) return reviewGateExit;
  const idCheckExit = await idCheck();
  if (idCheckExit !== 0) return idCheckExit;
  const testIntegrityExit = await testIntegrity();
  if (testIntegrityExit !== 0) return testIntegrityExit;

  const taskId = process.argv[2];
  if (!taskId) {
    console.error("usage: node scripts/scope-check.mjs <task-id>");
    return 2;
  }
  try {
    const { owns, violations, skipped } = checkBranch(taskId);
    if (skipped) {
      console.log(`scope-check: ${skipped} — nothing to compare.`);
      return 0;
    }
    if (!violations.length) {
      console.log(`scope-check: ${owns.length} owned path(s), every change inside them.`);
      return 0;
    }
    for (const violation of violations) console.error(`scope-check: ${violation}`);
    console.error(`scope-check: ${violations.length} violation(s). Add the path to this task's owns, or revert the change.`);
    return 1;
  } catch (error) {
    // Fail open, loudly: an internal error must not be mistaken for a clean branch.
    console.error(`scope-check: could not run (${error instanceof Error ? error.message : String(error)}) — not failing the branch.`);
    return 0;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
