// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as core from "./nextTaskCore.mjs";
import * as text from "./nextTaskText.mjs";
import { releaseLights } from "./nextTaskReleaseCore.mjs";

const SHA = "a".repeat(40), API = "b".repeat(40), OLD = "c".repeat(40);
const NOW = Date.parse("2026-11-20T08:00:00Z");
const run = (conclusion = "success") => ({ head_sha: SHA, status: "completed", conclusion });
const evidence = () => ({
  mainCi: { state: "green", sha: SHA }, checks: run(), landed: "green",
  deployApi: run(), deployWeb: run(), expectedApi: API, expectedWeb: SHA,
  liveApi: API, liveWeb: SHA, verified: { state: "success", sha: SHA },
  downIssues: [], incidents: [], jobs: { ok: true },
});
const lights = (extra = {}) => releaseLights({ ...evidence(), ...extra });
const task = (id: string, extra = {}) => ({ id, title: id, row: id, packet: "docs/plans/GATE-delivery.md", tier: 2,
  lane: id, branch: `agent/queue/${id}`, status: "todo", dependsOn: [], ...extra });
const landed = task("feature");
const fresh = task("next");
const input = (extra = {}) => ({
  tasks: [landed, fresh], mainCi: { state: "green", sha: SHA }, now: NOW, claimant: "GPT · newcomer",
  branches: new Map([[landed.branch, { tipMs: NOW - 4 * 3_600_000, tipSha: SHA, merged: false,
    markers: [{ verb: "Claim", id: landed.id, who: "GPT · builder" }] }]]),
  openPrs: new Map([[landed.branch, "https://github.com/example/repo/pull/1"]]),
  prCi: new Map([[landed.branch, { state: "green", sha: SHA }]]), mergedHeads: new Map(),
  release: lights(), ...extra,
});

describe("D-212 release lights are evidence, never guesses", () => {
  it("prints seven named green lights and both independently deployed identities", () => {
    const result = lights();
    expect(result.lights.map(l => [l.number, l.state])).toEqual([1, 2, 3, 4, 5, 6, 7].map(n => [n, "green"]));
    const rendered = text.renderReleaseLights(result);
    expect(rendered).toContain(SHA);
    expect(rendered).toContain(API);
    expect(rendered).toContain("7. No open incident: green");
  });

  it.each([
    [1, { mainCi: { state: "red", sha: SHA } }], [2, { checks: run("failure") }], [3, { landed: "red" }],
    [4, { deployApi: run("failure") }], [4, { deployWeb: run("failure") }],
    [5, { verified: { state: "failure", sha: SHA } }], [5, { liveApi: OLD }], [5, { liveWeb: OLD }],
    [6, { downIssues: [{ number: 7 }] }], [6, { jobs: { ok: false } }], [7, { incidents: [{ number: 8 }] }],
  ])("classifies light %s red from its own failed evidence", (number, extra) => {
    expect(lights(extra).lights.find(l => l.number === number)?.state).toBe("red");
  });

  it("all unreadable evidence is unknown, not green or a landing hold", () => {
    const result = releaseLights({});
    expect(result.lights.map(l => l.state)).toEqual(Array(7).fill("unknown"));
    expect(core.releaseLandingHold(result)).toBeNull();
  });

  it("ignores an old verification failure and does not equate in-progress with a breach", () => {
    expect(lights({ verified: { state: "failure", sha: OLD } }).lights[4].state).toBe("unknown");
    expect(lights({ deployApi: { ...run(), status: "in_progress", conclusion: null } }).lights[3].state).toBe("unknown");
  });

  it("a confirmed red component wins over a different unknown component", () => {
    expect(lights({ downIssues: null, jobs: { ok: false } }).lights[5].state).toBe("red");
    expect(lights({ incidents: [{ number: 8 }], liveWeb: null }).lights[6].state).toBe("red");
    expect(core.releaseLandingHold(lights({ incidents: [{ number: 8 }], liveWeb: null }))).toBeNull();
  });
});

describe("D-212 confirmed release failures hold landings, not branch work", () => {
  it("the control board really offers the unrelated landing", () => {
    expect(core.pickNextTask(input())).toMatchObject({ kind: "land", task: { id: "feature" } });
  });

  it.each([4, 5, 6, 7])("red light %s withholds landing but still offers a build", number => {
    const release = lights();
    release.lights[number - 1].state = "red";
    const picked = core.pickNextTask(input({ release }));
    expect(picked).toMatchObject({ kind: "build", task: { id: "next" }, releaseHold: { sha: SHA } });
    expect(text.renderPick(picked, { who: "GPT · newcomer", date: "2026-11-20" })).toContain("landings only");
  });

  it("unknown and lights 1-3 alone add no release landing hold", () => {
    for (const number of [1, 2, 3, 5]) {
      const release = lights();
      release.lights[number - 1].state = number === 5 ? "unknown" : "red";
      expect(core.pickNextTask(input({ release })).kind).toBe("land");
    }
  });

  it("holds a continued landing too and refuses a restricted unrelated landing", () => {
    const release = lights({ verified: { state: "failure", sha: SHA } });
    expect(core.pickNextTask(input({ release, claimant: "GPT · builder" })).kind).not.toBe("continue");
    expect(core.pickNextTask(input({ release, only: "feature" }))).toMatchObject({ kind: "ineligible" });
  });

  it("only an explicit main-registry incident fix gets priority and may land", () => {
    const fix = task("repair", { note: "Fixes incident: #8" });
    const release = lights({ incidents: [{ number: 8 }] });
    expect(core.pickNextTask(input({ tasks: [landed, fresh, fix], release })))
      .toMatchObject({ kind: "build", task: { id: "repair" }, releaseFix: true });
    const b = input().branches.get(landed.branch);
    expect(core.pickNextTask(input({ tasks: [landed, fix], release,
      branches: new Map([[fix.branch, { ...b, markers: [{ verb: "Claim", id: fix.id, who: "GPT · builder" }] }]]),
      openPrs: new Map([[fix.branch, "https://github.com/example/repo/pull/2"]]),
      prCi: new Map([[fix.branch, { state: "green", sha: SHA }]]),
    }))).toMatchObject({ kind: "land", task: { id: "repair" }, releaseFix: true });
    expect(core.pickNextTask(input({ tasks: [landed, fresh, task("fix-incident-8")], release })).task.id).toBe("next");
  });

  it("never grants an incident fix permission to skip dependencies or red main", () => {
    const release = lights({ incidents: [{ number: 8 }] });
    const fix = task("repair", { note: "Fixes incident: #8", dependsOn: [fresh.id] });
    expect(core.pickNextTask(input({ tasks: [landed, fresh, fix], release })).task.id).toBe("next");
    expect(core.pickNextTask(input({ release, mainCi: { state: "red", sha: SHA } })).kind).toBe("fix-main");
  });

  it("returns an honest release wait only when no branch work remains", () => {
    expect(core.pickNextTask(input({ tasks: [landed], release: lights({ jobs: { ok: false } }) })))
      .toMatchObject({ kind: "wait", releaseHold: { sha: SHA } });
  });
});
