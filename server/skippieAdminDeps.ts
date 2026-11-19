// Real read-only data sources for admin Skippie. Nothing here writes.
import { readFile } from "node:fs/promises";
import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";
import { listParkedPayments, readMoneyCheckFindings } from "./dailyMoneyCheck";
import { createMysqlJobRunStore } from "./jobRunStore";
import { SCHEDULED_JOBS } from "./scheduledJobRegistry";
import type { SkippieDeps } from "./skippieAdmin";

export function createSkippieAdminDeps(): SkippieDeps {
  const store = createMysqlJobRunStore();
  return {
    llm: ENV.forgeApiKey ? invokeLLM : undefined,
    tools: {
      money_check: async () => readMoneyCheckFindings(Date.now()),
      parked_payments: async () => (await listParkedPayments(25)).map(row => ({ id: row.id, amount: row.amount, currency: row.currency, reason: row.reconciliationReason, since: row.createdAt.toISOString() })),
      job_runs: async () => Promise.all(SCHEDULED_JOBS.map(async job => {
        const [last, ok] = await Promise.all([store.latest(job.name), store.latest(job.name, "succeeded")]);
        return { job: job.name, lastStatus: last?.status ?? null, lastAttempt: last?.attempt ?? null, lastStartedAt: last?.startedAt.toISOString() ?? null, lastSucceededAt: (ok?.finishedAt ?? ok?.startedAt)?.toISOString() ?? null };
      })),
      deploy_health: async () => ({ commitSha: await readFile("commit-sha.txt", "utf8").then(s => s.trim(), () => "unknown"), status: "serving (this response came from the running API)" }),
      sentry_issues: async () => {
        const token = process.env.SENTRY_READ_TOKEN;
        if (!token) return { configured: false, note: "No Sentry read token is set, so issues are not available here." };
        const response = await fetch("https://sentry.io/api/0/organizations/skipwait/issues/?statsPeriod=24h&query=is%3Aunresolved&limit=10", { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) return { configured: true, error: `Sentry returned ${response.status}` };
        const rows = (await response.json()) as Array<{ shortId: string; title: string; count: string; lastSeen: string }>;
        return rows.map(r => ({ id: r.shortId, title: r.title, events: r.count, lastSeen: r.lastSeen }));
      },
    },
  };
}
