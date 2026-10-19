import { beforeEach, describe, expect, it, vi } from "vitest";

const captureServerError = vi.fn();
vi.mock("./sentry", () => ({ captureServerError }));

const { mergeHeldStaleAsks } = await import("./askExpirySweep");

const row = (id: number, jobSeekerId: number, iso: string) => ({ id, jobSeekerId, createdAt: new Date(iso) });

describe("ask expiry sweep: held personal-link asks never block ordinary expiry", () => {
  beforeEach(() => { captureServerError.mockClear(); vi.spyOn(console, "error").mockImplementation(() => undefined); });

  it("still returns the ordinary unassigned asks when the held-ask query fails, and reports the failure", async () => {
    const unassigned = [row(11, 1, "2026-10-01T00:00:00Z"), row(12, 2, "2026-10-02T00:00:00Z")];
    const failure = new Error("Unknown column in on clause");
    const result = await mergeHeldStaleAsks(unassigned, async () => { throw failure; }, 200);
    expect(result).toEqual([{ id: 11, jobSeekerId: 1 }, { id: 12, jobSeekerId: 2 }]);
    expect(captureServerError).toHaveBeenCalledWith(failure, expect.objectContaining({ job: "ask-expiry-sweep", step: "held-asks" }));
  });

  it("merges held and unassigned asks oldest first within the same bound when both queries work", async () => {
    const unassigned = [row(11, 1, "2026-10-03T00:00:00Z")];
    const held = [row(21, 3, "2026-10-01T00:00:00Z"), row(22, 4, "2026-10-05T00:00:00Z")];
    expect(await mergeHeldStaleAsks(unassigned, async () => held, 2)).toEqual([{ id: 21, jobSeekerId: 3 }, { id: 11, jobSeekerId: 1 }]);
    expect(captureServerError).not.toHaveBeenCalled();
  });
});
