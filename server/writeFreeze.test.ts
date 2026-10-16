import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isWriteFrozen, writeFreezeResponse } from "../shared/writeFreeze";

const worker = readFileSync(new URL("../src/worker.ts", import.meta.url), "utf8");

describe("write freeze", () => {
  it("is off unless WRITE_FREEZE is exactly 1", () => {
    for (const env of [{}, { WRITE_FREEZE: "0" }, { WRITE_FREEZE: "true" }, { WRITE_FREEZE: 1 }]) {
      expect(isWriteFrozen(env)).toBe(false);
      expect(writeFreezeResponse(env, "POST", "/api/billing/webhook")).toBeNull();
    }
  });
  it("refuses state-changing methods with 503 and Retry-After when on", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
      const res = writeFreezeResponse({ WRITE_FREEZE: "1" }, method, "/api/chargebee/webhook");
      expect(res?.status).toBe(503);
      expect(res?.headers.get("retry-after")).toBe("120");
      expect(res?.headers.get("cache-control")).toBe("no-store");
      expect(JSON.stringify(await res?.json())).not.toMatch(/mysql|database|secret/i);
    }
  });
  it("lets reads and health checks through while frozen", () => {
    const env = { WRITE_FREEZE: "1" };
    for (const method of ["GET", "HEAD", "OPTIONS"]) expect(writeFreezeResponse(env, method, "/api/credits/summary")).toBeNull();
    expect(writeFreezeResponse(env, "POST", "/api/health")).toBeNull();
    expect(writeFreezeResponse(env, "POST", "/api/health/latency")).toBeNull();
    expect(writeFreezeResponse(env, "POST", "/api/healthy-lookalike")?.status).toBe(503);
  });
  it("is wired before the container is reached and skips the cron tick", () => {
    expect(worker.indexOf("writeFreezeResponse(env")).toBeGreaterThan(0);
    expect(worker.indexOf("writeFreezeResponse(env")).toBeLessThan(worker.indexOf("fetchContainerWithStoppedRecovery(container"));
    expect(worker).toContain("isWriteFrozen(env)");
  });
});
