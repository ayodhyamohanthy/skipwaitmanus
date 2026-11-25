// PICKER-avoid-repeat (docs/plans/FIX-nov13-stepup-avoid.md section 2): every hand-out tells a
// session to re-run "with --avoid <id> added", so a second --avoid must add to the first, never
// silently replace it (a D-321 rule 11 dead end: the picks then alternate forever).
import { beforeAll, describe, expect, it } from "vitest";

type Picker = {
  argsOf: (argv: string[]) => Record<string, unknown>;
  avoidSetOf: (values: unknown) => Set<string>;
};
let picker: Picker;

beforeAll(async () => {
  // Importing the CLI module behind an HTTPS proxy would otherwise re-run it once with the proxy flag.
  process.env.NODE_USE_ENV_PROXY = "1";
  picker = (await import("./next-task.mjs")) as unknown as Picker;
});

const avoided = (...argv: string[]) => [...picker.avoidSetOf(picker.argsOf(argv).avoid)].sort();

describe("--avoid", () => {
  it("accumulates repeated flags instead of keeping only the last", () => {
    expect(avoided("--avoid", "TASK-A", "--avoid", "TASK-B")).toEqual(["TASK-A", "TASK-B"]);
  });

  it("still accepts one comma list", () => {
    expect(avoided("--avoid", "TASK-A,TASK-B")).toEqual(["TASK-A", "TASK-B"]);
  });

  it("merges a comma list with a repeated flag and drops duplicates", () => {
    expect(avoided("--avoid", "TASK-A,TASK-B", "--avoid", "TASK-C", "--avoid", "TASK-A")).toEqual(["TASK-A", "TASK-B", "TASK-C"]);
  });

  it("drops empty entries and surrounding space", () => {
    expect(avoided("--avoid", " TASK-A , ,TASK-B,")).toEqual(["TASK-A", "TASK-B"]);
  });

  it("is empty when no --avoid is given", () => {
    expect(avoided("--as", "Claude Code · test")).toEqual([]);
  });

  it("leaves every other valued flag last-wins", () => {
    expect(picker.argsOf(["--note", "first", "--note", "second"]).note).toBe("second");
  });
});

describe("the hand-out sentence", () => {
  it("names both accepted forms, so following it twice never drops the first avoid", async () => {
    const source = (await import("node:fs")).readFileSync(new URL("./nextTaskText.mjs", import.meta.url), "utf8");
    expect(source).toMatch(/--avoid \$\{task\.id\}\\` added \(repeat the flag, or use one comma list, \\`--avoid a,b\\`\)/);
  });
});
