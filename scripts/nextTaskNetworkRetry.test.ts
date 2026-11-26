// PICKER-network-retry (D-324, D-321 (11), D-087): one dropped connection must not stop every
// session. On the owner's Mac about one GitHub read in sixty fails with ECONNRESET through the
// local proxy (measured: 59 of 60 identical reads succeeded). A picker run makes about 140
// reads, so a single attempt stopped runs that a second attempt would have finished: four
// consecutive `--claim` runs died at "cannot read main's CI runs from GitHub" while direct
// probes of the same endpoint passed 3 of 3, and an idle session could not pick any work.
//
// The retry is deliberately narrow: it repeats only a transport failure or a 5xx/429 answer,
// twice, on the same read. A 4xx is a real answer (a bad token, a missing route) and stops at
// once, and a caller's own cancellation or the 15 s timeout is never retried, so a slow GitHub
// cannot turn into a 45 s stall on every one of the run's reads. Writes (`githubWrite`) are not
// retried here: the picker's own snapshot protocol decides whether a write may be repeated.
import { describe, expect, it, vi } from "vitest";
import { GITHUB_READ_ATTEMPTS, isTransientGithubFailure } from "./next-task.mjs";

const failure = (over: Record<string, unknown>) => Object.assign(new Error("fetch failed"), over);

describe("GitHub read retry policy (PICKER-network-retry)", () => {
  it("retries a dropped connection and a 5xx or 429 answer, a bounded number of times", () => {
    expect(GITHUB_READ_ATTEMPTS).toBe(3);
    expect(isTransientGithubFailure(failure({ name: "TypeError", message: "fetch failed", cause: { code: "ECONNRESET" } }))).toBe(true);
    expect(isTransientGithubFailure(failure({ name: "TypeError", message: "fetch failed", cause: { code: "EAI_AGAIN" } }))).toBe(true);
    expect(isTransientGithubFailure(failure({ message: "GitHub /pulls answered 502", status: 502 }))).toBe(true);
    expect(isTransientGithubFailure(failure({ message: "GitHub /pulls answered 429", status: 429 }))).toBe(true);
  });

  it("never retries a real answer, a caller's cancellation or a timeout", () => {
    for (const status of [400, 401, 403, 404, 410, 422]) {
      expect(isTransientGithubFailure(failure({ message: `GitHub /pulls answered ${status}`, status })), String(status)).toBe(false);
    }
    expect(isTransientGithubFailure(failure({ name: "AbortError", message: "This operation was aborted" }))).toBe(false);
    expect(isTransientGithubFailure(failure({ name: "TimeoutError", message: "The operation was aborted due to timeout" }))).toBe(false);
    expect(isTransientGithubFailure(new Error("something else"))).toBe(false);
    expect(isTransientGithubFailure("fetch failed")).toBe(false);
  });
});

describe("the real picker read survives one reset", () => {
  const okResponse = { ok: true, status: 200, json: async () => ({ workflow_runs: [] }) };

  it("returns the answer after one ECONNRESET, instead of stopping the whole run", async () => {
    const { github } = await import("./next-task.mjs");
    const calls: number[] = [];
    const realFetch = globalThis.fetch;
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      n += 1;
      calls.push(n);
      if (n === 1) throw failure({ name: "TypeError", message: "fetch failed", cause: { code: "ECONNRESET" } });
      return okResponse;
    });
    try {
      await expect(github("o/r", "/actions/workflows/ci.yml/runs?branch=main")).resolves.toEqual({ workflow_runs: [] });
      expect(calls).toEqual([1, 2]);
    } finally {
      vi.stubGlobal("fetch", realFetch);
    }
  });

  it("still fails closed when every attempt fails, so unknown stays unknown", async () => {
    const { github } = await import("./next-task.mjs");
    const realFetch = globalThis.fetch;
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      n += 1;
      throw failure({ name: "TypeError", message: "fetch failed", cause: { code: "ECONNRESET" } });
    });
    try {
      await expect(github("o/r", "/pulls?state=open")).rejects.toThrow(/fetch failed/);
      expect(n).toBe(GITHUB_READ_ATTEMPTS);
    } finally {
      vi.stubGlobal("fetch", realFetch);
    }
  });

  it("does not retry a 404: a real answer is never repeated", async () => {
    const { github } = await import("./next-task.mjs");
    const realFetch = globalThis.fetch;
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      n += 1;
      return { ok: false, status: 404, json: async () => ({}) };
    });
    try {
      await expect(github("o/r", "/pulls/1")).rejects.toThrow(/answered 404/);
      expect(n).toBe(1);
    } finally {
      vi.stubGlobal("fetch", realFetch);
    }
  });
});
