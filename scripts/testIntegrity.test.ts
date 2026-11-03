import { describe, expect, it } from "vitest";
import { isPinnedTestFile, parseDiff, pullRequestBody, testIntegrityViolations } from "./testIntegrityCore.mjs";

// The focus and skip markers are assembled at runtime, so this file never adds the very
// lines the check forbids (it runs on its own pull request).
const ONLY = ".on" + "ly(";
const SKIP = ".sk" + "ip(";

/** A unified diff for one modified file, `--unified=0` style. */
function modified(path: string, removed: string[], added: string[]): string {
  return [
    `diff --git a/${path} b/${path}`,
    "index 1111111..2222222 100644",
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,${removed.length} +1,${added.length} @@`,
    ...removed.map(line => `-${line}`),
    ...added.map(line => `+${line}`),
    "",
  ].join("\n");
}

function deleted(path: string, removed: string[]): string {
  return [
    `diff --git a/${path} b/${path}`,
    "deleted file mode 100644",
    "index 1111111..0000000",
    `--- a/${path}`,
    "+++ /dev/null",
    `@@ -1,${removed.length} +0,0 @@`,
    ...removed.map(line => `-${line}`),
    "",
  ].join("\n");
}

function added(path: string, lines: string[]): string {
  return [
    `diff --git a/${path} b/${path}`,
    "new file mode 100644",
    "index 0000000..2222222",
    "--- /dev/null",
    `+++ b/${path}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map(line => `+${line}`),
    "",
  ].join("\n");
}

function renamed(from: string, to: string): string {
  return [
    `diff --git a/${from} b/${to}`,
    "similarity index 100%",
    `rename from ${from}`,
    `rename to ${to}`,
    "",
  ].join("\n");
}

const ASK = "client/src/pages/ask.test.tsx";
const LOGIN = "client/src/pages/loginRule.test.tsx";
const LEDGER = "server/creditLedger.test.ts";

const check = (diff: string, extra: { owns?: string[]; body?: string | null; commits?: string[] } = {}) =>
  testIntegrityViolations({ diff, owns: extra.owns ?? [], body: extra.body ?? "", commits: extra.commits ?? [] });

const table = (file: string) => [
  "## What and why",
  "Moved the checks.",
  "",
  "## Ported assertions",
  "| File | Where each removed assertion now lives |",
  "|---|---|",
  `| ${file} | client/src/pages/askFlow.test.tsx, the "keeps the referrer" case |`,
].join("\n");

describe("GATE-test-integrity: parseDiff", () => {
  it("reads added, deleted, renamed and modified files with their lines", () => {
    const files = parseDiff([modified(ASK, ["  expect(a).toBe(1);"], ["  expect(a).toBe(2);"]), deleted("a.test.ts", ["x"]), added("b.test.ts", ["y"]), renamed("c.test.ts", "d.test.ts")].join(""));
    expect(files.map(f => [f.status, f.oldPath, f.newPath])).toEqual([
      ["modified", ASK, ASK],
      ["deleted", "a.test.ts", null],
      ["added", null, "b.test.ts"],
      ["renamed", "c.test.ts", "d.test.ts"],
    ]);
    expect(files[0].removed).toEqual(["  expect(a).toBe(1);"]);
    expect(files[0].added).toEqual(["  expect(a).toBe(2);"]);
  });
});

describe("GATE-test-integrity: rule 1, a test file is deleted or renamed away", () => {
  it("fails a deleted test file the task does not own", () => {
    expect(check(deleted(ASK, ["expect(a).toBe(1);"])).join("\n")).toMatch(/ask\.test\.tsx.*deleted/);
  });

  it("fails a renamed test file the task does not own", () => {
    expect(check(renamed(ASK, "client/src/pages/askOld.test.tsx")).join("\n")).toMatch(/ask\.test\.tsx.*renamed/);
  });

  it("passes a deletion the task's owns names (the retirement rule)", () => {
    expect(check(deleted(ASK, ["expect(a).toBe(1);"]), { owns: [ASK] })).toEqual([]);
    expect(check(deleted(ASK, ["expect(a).toBe(1);"]), { owns: ["client/src/pages/**"] })).toEqual([]);
  });

  it("ignores a deleted file that is not a test", () => {
    expect(check(deleted("client/src/pages/ask.tsx", ["export {}"]))).toEqual([]);
  });
});

describe("GATE-test-integrity: rule 2, a focused test", () => {
  it(`fails an added ${ONLY}`, () => {
    expect(check(modified(ASK, [], [`  it${ONLY}"runs alone", () => {});`])).join("\n")).toMatch(/only/);
  });

  it("passes the same file without it", () => {
    expect(check(modified(ASK, [], ['  it("runs with the rest", () => { expect(1).toBe(1); });']))).toEqual([]);
  });

  it("ignores a focus marker that was already there (only added lines count)", () => {
    expect(check(modified(ASK, [`  it${ONLY}"old", () => {});`], [`  it${ONLY}"old", () => {});`]))).toEqual([]);
  });
});

describe("GATE-test-integrity: rule 3, a new skip", () => {
  it.each([
    `  it${SKIP}"later", () => {});`,
    `  describe${SKIP}"later", () => {});`,
    '  it.to' + 'do("later");',
    '  xi' + 't("later", () => {});',
    '  test.sk' + 'ip.each([1])("later %s", () => {});',
  ])("fails %s", line => {
    expect(check(modified(ASK, [], [line])).join("\n")).toMatch(/skip|todo|xit/);
  });

  it("passes a normal added test", () => {
    expect(check(modified(ASK, [], ['  it("now", () => { expect(1).toBe(1); });']))).toEqual([]);
  });

  it("ignores a skip in a file that is not a test", () => {
    expect(check(modified("server/jobs.ts", [], [`  queue${SKIP}job);`]))).toEqual([]);
  });
});

describe("GATE-test-integrity: rule 4, fewer assertion lines", () => {
  const loses = modified(ASK, ["  expect(a).toBe(1);", "  expect(b).toBe(2);"], ["  expect(a).toBe(1);"]);

  it("fails a test file that ends with fewer assertion lines", () => {
    expect(check(loses).join("\n")).toMatch(/ask\.test\.tsx.*2 .*1/);
  });

  it("counts assert lines too", () => {
    expect(check(modified("server/x.test.ts", ["  assert.equal(a, 1);"], [])).join("\n")).toMatch(/x\.test\.ts/);
  });

  it("passes when the count holds (an edited assertion)", () => {
    expect(check(modified(ASK, ["  expect(a).toBe(1);"], ["  expect(a).toBe(2);"]))).toEqual([]);
  });

  it("passes with a Ported assertions table row that names the file", () => {
    expect(check(loses, { body: table(ASK) })).toEqual([]);
  });

  it("fails when the table names another file or has no destination", () => {
    expect(check(loses, { body: table("client/src/pages/queue.test.tsx") }).length).toBe(1);
    expect(check(loses, { body: ["## Ported assertions", "| File | Where |", "|---|---|", `| ${ASK} |  |`].join("\n") }).length).toBe(1);
  });

  it("fails when the file is named outside the Ported assertions section", () => {
    expect(check(loses, { body: ["## What and why", "| File | Where |", "|---|---|", `| ${ASK} | elsewhere |`].join("\n") }).length).toBe(1);
  });

  it("survives a missing PR body", () => {
    expect(check(loses, { body: null }).length).toBe(1);
  });
});

describe("GATE-test-integrity: rule 5, pinned login and money tests", () => {
  it("pins the login tests and the money server tests", () => {
    expect(isPinnedTestFile(LOGIN)).toBe(true);
    expect(isPinnedTestFile("client/src/pages/signIn.test.tsx")).toBe(true);
    for (const path of [LEDGER, "server/dailyMoneyCheck.test.ts", "server/payments.test.ts", "server/chargebeeWebhook.test.ts", "server/refundFlow.test.ts"]) expect(isPinnedTestFile(path)).toBe(true);
    expect(isPinnedTestFile(ASK)).toBe(false);
    expect(isPinnedTestFile("server/nested/payment.test.ts")).toBe(false);
    expect(isPinnedTestFile("server/payment.ts")).toBe(false);
  });

  it("fails a pinned file that loses any assertion line, even with a table", () => {
    const diff = modified(LEDGER, ["  expect(balance).toBe(3);"], []);
    expect(check(diff, { body: table(LEDGER) }).join("\n")).toMatch(/creditLedger\.test\.ts.*pinned/);
  });

  it("fails a pinned file whose assertion is loosened while the count holds", () => {
    expect(check(modified(LOGIN, ['  expect(screen.getByText("Work email")).toBeTruthy();'], ["  expect(true).toBe(true);"])).join("\n")).toMatch(/pinned/);
  });

  it("passes a pinned file whose assertion only moved inside it", () => {
    expect(check(modified(LOGIN, ['  expect(a).toBe("x");'], ['    expect(a).toBe("x");']))).toEqual([]);
  });

  it("passes a pinned file that only gains assertions", () => {
    expect(check(modified(LEDGER, [], ["  expect(balance).toBe(4);"]))).toEqual([]);
  });

  it("passes with a commit marker naming the file and a decision", () => {
    const diff = modified(LEDGER, ["  expect(balance).toBe(3);"], []);
    expect(check(diff, { commits: [`Drop the old pack balance check\n\ntest-integrity: ${LEDGER} — D-219`] })).toEqual([]);
  });

  it("does not take a marker for another file or without a decision", () => {
    const diff = modified(LEDGER, ["  expect(balance).toBe(3);"], []);
    expect(check(diff, { commits: [`test-integrity: ${LOGIN} — D-219`] }).length).toBeGreaterThan(0);
    expect(check(diff, { commits: [`test-integrity: ${LEDGER} — because`] }).length).toBeGreaterThan(0);
  });

  it("fails a pinned file deleted even when owned, unless a marker names it", () => {
    expect(check(deleted(LEDGER, ["expect(a).toBe(1);"]), { owns: [LEDGER] }).join("\n")).toMatch(/pinned/);
    expect(check(deleted(LEDGER, ["expect(a).toBe(1);"]), { owns: [LEDGER], commits: [`test-integrity: ${LEDGER} — D-219`] })).toEqual([]);
  });
});

describe("GATE-test-integrity: what passes at once", () => {
  it("passes a PR that only adds tests", () => {
    expect(check([added("server/newThing.test.ts", ['it("works", () => { expect(1).toBe(1); });']), modified(ASK, [], ["  expect(c).toBe(3);"])].join(""))).toEqual([]);
  });

  it("passes a moved assertion with a table row on rule 4 but not on rule 5", () => {
    const moved = [
      modified(ASK, ["  expect(a).toBe(1);"], []),
      modified(LEDGER, ["  expect(a).toBe(1);"], []),
      modified("client/src/pages/askFlow.test.tsx", [], ["  expect(a).toBe(1);"]),
    ].join("");
    const body = [table(ASK), `| ${LEDGER} | client/src/pages/askFlow.test.tsx |`].join("\n");
    const violations = check(moved, { body });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/creditLedger\.test\.ts.*pinned/);
  });

  it("passes a docs-only diff", () => {
    expect(check(modified("docs/plans/GATE-delivery.md", ["old"], ["new"]))).toEqual([]);
  });

  it("passes an empty diff", () => {
    expect(check("")).toEqual([]);
  });

  it("passes a push to main at once: no pull_request in the event", () => {
    expect(pullRequestBody({ ref: "refs/heads/main", head_commit: { id: "abc" } })).toBeUndefined();
    expect(pullRequestBody(null)).toBeUndefined();
  });

  it("reads the PR body from the event, empty when the body is null", () => {
    expect(pullRequestBody({ pull_request: { number: 1, body: "## Ported assertions" } })).toBe("## Ported assertions");
    expect(pullRequestBody({ pull_request: { number: 1, body: null } })).toBe("");
  });
});
