import { getTableColumns } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { operationalActivityLogs } from "../drizzle/schema";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import { AUTH_RETENTION_BATCH, createAuthActivityRetention, type AuthRetentionStore } from "./authActivityRetention";

// ADMIN-activity-log (D-393): sign-in rows older than 90 days go; nothing else does.
const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const store = createInMemoryDrizzle();
const NOW = Date.parse("2026-11-25T03:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000);
const log = (id: number, action: string, createdAt: Date): Row => ({ ...Object.fromEntries(Object.keys(getTableColumns(operationalActivityLogs)).map(key => [key, null])), id, action, outcome: "success", createdAt });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
});

describe("auth-activity-retention", () => {
  it("deletes only sign-in rows older than 90 days", async () => {
    store.reset([[operationalActivityLogs, [
      log(1, "auth.password_sign_in", daysAgo(91)),
      log(2, "auth.work_email_code_verified", daysAgo(120)),
      log(3, "auth.password_sign_in", daysAgo(89)),
      log(4, "auth.workos_user_deleted", daysAgo(200)),
      log(5, "work_email.step_up_verified", daysAgo(200)),
      log(6, "company_referral.created", daysAgo(400)),
      log(7, "admin.activity_viewed", daysAgo(400)),
    ]]]);
    const out = await createAuthActivityRetention()({ nowMs: NOW, windowKey: "2026-11-25T00:00Z" });
    expect(out).toEqual({ processed: 2, failed: 0 });
    expect(store.rows(operationalActivityLogs).map(row => row.id)).toEqual([3, 4, 5, 6, 7]);
  });

  it("works through a backlog in bounded batches and stops when nothing is left", async () => {
    const calls: number[] = [];
    let remaining = AUTH_RETENTION_BATCH * 2 + 7;
    const fake: AuthRetentionStore = {
      async expiredIds(_cutoff, limit) { const take = Math.min(limit, remaining); calls.push(take); return Array.from({ length: take }, (_, index) => index + 1); },
      async deleteIds(ids) { remaining -= ids.length; return ids.length; },
    };
    const out = await createAuthActivityRetention(fake)({ nowMs: NOW, windowKey: "2026-11-25T00:00Z" });
    expect(out.processed).toBe(AUTH_RETENTION_BATCH * 2 + 7);
    expect(calls).toEqual([AUTH_RETENTION_BATCH, AUTH_RETENTION_BATCH, 7]);
  });

  it("uses a cutoff computed from the run's own clock", async () => {
    const cutoffs: Date[] = [];
    await createAuthActivityRetention({ async expiredIds(cutoff) { cutoffs.push(cutoff); return []; }, async deleteIds() { return 0; } })({ nowMs: NOW, windowKey: "2026-11-25T00:00Z" });
    expect(cutoffs).toEqual([daysAgo(90)]);
  });
});
