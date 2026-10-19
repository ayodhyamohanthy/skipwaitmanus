import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deriveJobsTickToken, unixMinute } from "../shared/jobsTick";
import { verifyJobsTickToken } from "./jobsTickAuth";

const SECRET = "jobs-tick-test-secret";
const NOW = Date.parse("2026-10-14T10:15:00.200Z");
const MINUTE = unixMinute(NOW);
const tokenFor = (minute: number, secret = SECRET) => createHmac("sha256", secret).update(`jobs-tick:${minute}`).digest("hex");

describe("jobs tick token verification", () => {
  it("accepts the Worker's token for the previous, current and next minute", async () => {
    for (const offset of [-1, 0, 1]) expect(await verifyJobsTickToken(tokenFor(MINUTE + offset), SECRET, NOW)).toBe(true);
  });

  it("accepts a token the Worker derived a few hundred milliseconds across the minute boundary", async () => {
    const workerToken = await deriveJobsTickToken(SECRET, unixMinute(NOW));
    expect(await verifyJobsTickToken(workerToken, SECRET, NOW - 400)).toBe(true);
    expect(await verifyJobsTickToken(workerToken, SECRET, NOW + 400)).toBe(true);
  });

  it("rejects a token two or more minutes old or ahead (replay window is bounded)", async () => {
    for (const offset of [-2, -10, 2, 60]) expect(await verifyJobsTickToken(tokenFor(MINUTE + offset), SECRET, NOW)).toBe(false);
  });

  it("rejects a token signed with another secret", async () => {
    expect(await verifyJobsTickToken(tokenFor(MINUTE, "another-secret"), SECRET, NOW)).toBe(false);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["short", tokenFor(MINUTE).slice(0, 63)],
    ["long", `${tokenFor(MINUTE)}0`],
    ["uppercase", tokenFor(MINUTE).toUpperCase()],
    ["non-hex", "z".repeat(64)],
    ["padded", ` ${tokenFor(MINUTE).slice(1)}`],
  ])("rejects a %s token without throwing", async (_label, presented) => {
    await expect(verifyJobsTickToken(presented, SECRET, NOW)).resolves.toBe(false);
  });

  it("rejects everything when the secret is unset", async () => {
    expect(await verifyJobsTickToken(tokenFor(MINUTE, ""), "", NOW)).toBe(false);
  });
});
