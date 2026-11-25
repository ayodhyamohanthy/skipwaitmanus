import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { healthJobsResponseSchema } from "../shared/scheduledJobs";

export async function jobsEndpointAvailable(response: Response): Promise<boolean> {
  if (response.status !== 200 || !response.headers.get("content-type")?.includes("application/json")) return false;
  try {
    return healthJobsResponseSchema.safeParse(await response.json()).success;
  } catch {
    return false;
  }
}

interface WaitOptions {
  read: () => Promise<boolean>;
  wait?: (milliseconds: number) => Promise<void>;
  log?: (message: string) => void;
  now?: () => number;
  timeoutMs?: number;
  intervalMs?: number;
}

export async function waitForWatchdogJobs({
  read, wait = setTimeout, log = console.log, now = Date.now,
  timeoutMs = 45 * 60_000, intervalMs = 30_000,
}: WaitOptions): Promise<void> {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    let available = false;
    try { available = await read(); } catch { /* Retry transient rollout failures without logging response data. */ }
    if (available) {
      log("watchdog jobs endpoint contract is live");
      return;
    }
    const remaining = deadline - now();
    if (remaining <= 0) break;
    log("waiting for the public jobs endpoint contract");
    await wait(Math.min(intervalMs, remaining));
  }
  throw new Error("Jobs endpoint contract was not available before watchdog deployment");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await waitForWatchdogJobs({
    read: async () => jobsEndpointAvailable(await fetch("https://skipwait.me/api/health/jobs", {
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
    })),
  });
}
