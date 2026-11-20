import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { jobsEndpointAvailable, waitForWatchdogJobs } from "./waitWatchdogJobs";

const body = { ok: false, jobs: [{ name: "daily-money-check", overdue: true }] };
const json = (value: object, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json" },
});

describe("watchdog jobs deployment prerequisite", () => {
  it("accepts the strict deployed contract even when a real job is overdue", async () => {
    expect(await jobsEndpointAvailable(json(body))).toBe(true);
    expect(await jobsEndpointAvailable(json({ ok: true, jobs: [{ name: "daily-money-check", overdue: false }] }))).toBe(true);
  });

  it("rejects an absent, HTML, malformed or private-data response", async () => {
    for (const response of [
      json(body, 404), json(body, 503),
      new Response("<html>old API</html>", { headers: { "Content-Type": "text/html" } }),
      new Response("broken", { headers: { "Content-Type": "application/json" } }),
      json({ ok: true }), json({ ...body, diagnostic: "private" }),
      json({ ok: true, jobs: [{ name: "not-registered", overdue: false }] }),
    ]) expect(await jobsEndpointAvailable(response)).toBe(false);
  });

  it("waits through rollout and transient failure before allowing deployment", async () => {
    let clock = 0;
    const read = vi.fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(true);
    const wait = vi.fn(async (ms: number) => { clock += ms; });
    const log = vi.fn();
    await waitForWatchdogJobs({ read, wait, log, now: () => clock, timeoutMs: 100, intervalMs: 10 });
    expect(read).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[10], [10]]);
    expect(log).toHaveBeenLastCalledWith("watchdog jobs endpoint contract is live");
  });

  it("fails at its deadline without copying upstream errors into logs", async () => {
    let clock = 0;
    const log = vi.fn();
    const read = vi.fn(async () => { throw new Error("private upstream details"); });
    await expect(waitForWatchdogJobs({
      read, log, now: () => clock, timeoutMs: 20, intervalMs: 10,
      wait: async ms => { clock += ms; },
    })).rejects.toThrow("Jobs endpoint contract was not available before watchdog deployment");
    expect(read).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
  });

  it("runs only on main before the watchdog deployment", () => {
    const workflow = readFileSync(new URL("../.github/workflows/deploy-watchdog.yml", import.meta.url), "utf8");
    const waitStep = workflow.indexOf("- name: Wait for the public jobs contract");
    const deployStep = workflow.indexOf("- name: Deploy the watchdog Worker");
    expect(waitStep).toBeGreaterThan(0);
    expect(waitStep).toBeLessThan(deployStep);
    expect(workflow.slice(waitStep, deployStep)).toContain("github.event_name != 'pull_request' && github.ref == 'refs/heads/main'");
    expect(workflow.slice(waitStep, deployStep)).toContain("pnpm exec tsx scripts/waitWatchdogJobs.ts");
    expect(workflow).toContain('"scripts/waitWatchdogJobs.ts"');
    expect(workflow).toContain("timeout-minutes: 60");
  });
});
