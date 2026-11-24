// @vitest-environment node
// A lock ref can vanish between the picker's snapshot read and its claim: another
// session merges the lock and a concurrent prune drops the remote-tracking ref.
// Before this fix `tip()` threw, the whole pick died with exit 1, and every
// session that picked the same row hit the same crash. The claim now re-checks
// the ref and falls back to main, exactly as a lock that never existed does.
import { describe, expect, it } from "vitest";
import { lockTipWith } from "./next-task.mjs";

const build = (present: ReadonlySet<string>) => lockTipWith({
  exists: name => present.has(name),
  tipOf: name => {
    if (!present.has(name)) throw new Error(`git rev-parse failed: refs/remotes/origin/${name}`);
    return `tip:${name}`;
  },
  main: () => "tip:main",
});

describe("a lock ref that vanished between the snapshot and the claim", () => {
  it("claims from main when the snapshot said the lock existed but the ref is gone", () => {
    expect(build(new Set())("agent/architect/skippy-auto-send", true)).toBe("tip:main");
  });

  it("still takes over a lock that is really there", () => {
    expect(build(new Set(["agent/architect/x"]))("agent/architect/x", true)).toBe("tip:agent/architect/x");
  });

  it("claims from main when the snapshot already said there was no lock", () => {
    expect(build(new Set(["agent/architect/x"]))("agent/architect/x", false)).toBe("tip:main");
  });
});
