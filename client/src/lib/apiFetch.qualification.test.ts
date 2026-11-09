import { afterEach, describe, expect, it, vi } from "vitest";
const { captured } = vi.hoisted(() => ({ captured: [] as Array<{ error: unknown; context?: Record<string, unknown> }> }));
vi.mock("./sentry", () => ({ captureClientError: (error: unknown, context?: Record<string, unknown>) => captured.push({ error, context }) }));
import { apiFetch, reportQueryCacheError, resetApiFetchReportsForTests } from "./apiFetch";
afterEach(() => { captured.length = 0; resetApiFetchReportsForTests(); vi.unstubAllGlobals(); });
describe("client telemetry privacy qualification", () => {
  it("keeps a caller's original thrown error while normalizing telemetry", async () => {
    const error = new Error("SYNTHETIC_PRIVATE_CALLER_ERROR");
    vi.stubGlobal("fetch", vi.fn(async () => { throw error; }));
    await expect(apiFetch("/api/auth/otp/send")).rejects.toBe(error);
    expect(captured).toHaveLength(1);
    expect((captured[0].error as Error).message).not.toContain(error.message);
  });
  it("deduplicates different secret-bearing messages into one safe failure bucket", () => {
    reportQueryCacheError(new Error("private-first"), "query");
    reportQueryCacheError(new Error("private-second"), "query");
    expect(captured).toHaveLength(1);
    expect((captured[0].error as Error).message).toBe("api_query_failure");
    expect(captured[0].context).toEqual({ source: "react-query", kind: "api_query_failure" });
  });
  it("does not forward secret-bearing query error messages into captured telemetry", () => {
    const canary = "SYNTHETIC_PRIVATE_TOKEN_7f9ac2";
    const error = Object.assign(new Error(`Request failed for /api/referrer-review-links/${canary}?code=654321`), { data: { httpStatus: 500 } });
    reportQueryCacheError(error, "query");
    expect(captured).toHaveLength(1);
    const serialized = JSON.stringify(captured.map(entry => ({ message: entry.error instanceof Error ? entry.error.message : String(entry.error), context: entry.context })));
    expect(serialized).not.toContain(canary);
    expect(serialized).not.toContain("654321");
  });
});
