// @vitest-environment node
import { describe, expect, it } from "vitest";
import { pickNextTask } from "./nextTaskCore.mjs";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const HOUR = 3_600_000;
const green = { state: "green", sha: "a".repeat(40), url: "https://ci/run/1" };
const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `${id} title`,
  row: id,
  packet: "docs/plans/FND-1-toolchain-and-test-collection.md",
  tier: 2,
  lane: id,
  branch: `agent/queue/${id.toLowerCase()}`,
  status: "todo",
  dependsOn: [] as string[],
  ...extra,
});
const claim = (who: string, id: string, hoursAgo = 1) => ({
  tipMs: NOW - hoursAgo * HOUR,
  merged: false,
  markers: [{ verb: "Claim", id, who }],
});
const unblock = (who: string, hoursAgo = 0.5) => ({
  tipMs: NOW - hoursAgo * HOUR,
  merged: false,
  markers: [{ verb: "Unblock", id: "A", who }],
});
const blocked = (who: string, hoursAgo = 3) => ({
  id: "A",
  status: "blocked",
  who,
  at: NOW - hoursAgo * HOUR,
  note: "awaiting a ruling",
});
const pick = (tasks: ReturnType<typeof task>[], options: {
  branches?: [string, ReturnType<typeof claim>][];
  reports?: ReturnType<typeof blocked>[];
  claimant?: string | null;
  avoid?: string[];
} = {}) => pickNextTask({
  tasks,
  mainCi: green,
  branches: new Map(options.branches ?? []),
  openPrs: new Map(),
  mergedHeads: new Map(),
  reports: options.reports ?? [],
  now: NOW,
  claimant: options.claimant ?? null,
  avoid: new Set(options.avoid ?? []),
});

describe("PICKER-avoid-unblock", () => {
  it("does not continue an existing unblock for a task in --avoid", () => {
    const builder = "Builder · s1";
    const holder = "Mistral · u1";
    const result = pick([task("A"), task("B")], {
      branches: [
        ["agent/queue/a", claim(builder, "A")],
        ["agent/architect/a", unblock(holder)],
      ],
      reports: [blocked(builder)],
      claimant: holder,
      avoid: ["A"],
    });

    expect(result).toMatchObject({ kind: "build", task: { id: "B" } });
    expect(result).not.toMatchObject({ kind: "continue", of: "unblock", task: { id: "A" } });
  });

  it("keeps --avoid selecting the eligible fresh task", () => {
    expect(pick([task("A"), task("B")], { claimant: "Cue Agent · c1", avoid: ["A"] }))
      .toMatchObject({ kind: "build", task: { id: "B" } });
  });

  it("keeps the blocked builder from clearing its own block", () => {
    const builder = "Builder · s1";
    expect(pick([task("A"), task("B")], {
      branches: [["agent/queue/a", claim(builder, "A")]],
      reports: [blocked(builder)],
      claimant: builder,
      avoid: ["A"],
    })).toMatchObject({ kind: "wait", gate: "A", blocked: true });
  });
});
