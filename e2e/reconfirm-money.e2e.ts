// D-174-no-expiry-release, packet §7 step 1 as ruled by D-411 (3): the QA preview of reconfirm-before-spend.
// Real server code, real MySQL, fictional accounts, no provider call and no real money. A waiting referral
// request created 31 days ago, whose seeker holds one fresh free credit, is not charged by the hourly
// coverage-delivery retry until the seeker confirms it; after the confirmation it is charged exactly once,
// however many retries follow. The journey runs on the release head, where ASK_RECONFIRM_ENABLED and
// ASK_NO_EXPIRY_ENABLED are both on.
//
// Like banded-spend.e2e.ts, it copies only table structures from the migrated local CI database into a
// throwaway database, seeds its own rows there and drops it afterwards: the shared seeded accounts the other
// journeys use are never touched.
import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq } from "drizzle-orm";
import { test, expect } from "playwright/test";
import { jobs, notifications, profiles, referralRequests, referralTransitionEvents, tokenBalances, tokenTransactions, users } from "../drizzle/schema";
import { ASK_RECONFIRM_ENABLED } from "../shared/askReconfirm";
import { ASK_NO_EXPIRY_ENABLED } from "../shared/askNoExpiry";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";

const DAY = 86_400_000;
const DOMAIN = "reconfirm-qa.example";

test("a 31-day-old waiting request is charged only after the seeker confirms, then exactly once", async () => {
  expect(ASK_RECONFIRM_ENABLED, "the release turns reconfirm-before-spend on").toBe(true);
  expect(ASK_NO_EXPIRY_ENABLED, "the release turns the ask clocks off together with it").toBe(true);

  const url = new URL(process.env.E2E_DATABASE_URL || "mysql://root:e2e@127.0.0.1:3306/skipwait");
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("The reconfirm QA journey refuses a non-local database");
  const source = url.pathname.slice(1);
  if (!/^[a-zA-Z0-9_]+$/.test(source)) throw new Error("Invalid local fixture database name");
  const options = { host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password) };
  const scratch = `sw_reconfirm_${randomUUID().replaceAll("-", "")}`;
  const admin = await mysql.createConnection(options);
  let created = false;
  try {
    await admin.query(`CREATE DATABASE \`${scratch}\``);
    created = true;
    const [tables] = await admin.query<mysql.RowDataPacket[]>("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'", [source]);
    for (const { name } of tables) await admin.query(`CREATE TABLE \`${scratch}\`.\`${name}\` LIKE \`${source}\`.\`${name}\``);

    const scratchUrl = new URL(url.toString());
    scratchUrl.pathname = `/${scratch}`;
    process.env.DATABASE_URL = scratchUrl.toString();
    process.env.BANDED_SALES_ENABLED = "false";

    const now = new Date();
    const createdAt = new Date(now.getTime() - 31 * DAY);
    const fixture = await mysql.createConnection({ ...options, database: scratch });
    const fx = drizzle(fixture);
    try {
      const [seeker] = await fx.insert(users).values({ openId: `qa-reconfirm-seeker-${randomUUID()}`, name: "QA Seeker", email: "qa-seeker@reconfirm-qa.example", loginMethod: "email" }).$returningId();
      const [referrer] = await fx.insert(users).values({ openId: `qa-reconfirm-referrer-${randomUUID()}`, name: "QA Referrer", email: `qa-referrer@${DOMAIN}`, loginMethod: "email" }).$returningId();
      await fx.insert(profiles).values({ userId: referrer.id, accountType: "referrer", workEmail: `qa-referrer@${DOMAIN}`, workEmailDomain: DOMAIN, workEmailVerifiedAt: now, paused: false, referralCapacity: 3 });
      const [job] = await fx.insert(jobs).values({ company: DOMAIN, title: "QA Engineer", location: "Remote", seniority: "Mid", employmentType: "Full-time", workMode: "Remote", description: "Fictional QA job for the reconfirm journey.", targetRoleUrl: `https://careers.${DOMAIN}/job/1` }).$returningId();
      const [ask] = await fx.insert(referralRequests).values({ jobId: job.id, jobSeekerId: seeker.id, personalPitch: "Fictional QA request.", status: "pending", waitingForCoverage: true, coverageQueuedAt: createdAt, coverageHeldAt: null, createdAt, updatedAt: createdAt }).$returningId();
      await fx.insert(tokenBalances).values({ userId: seeker.id, role: "job_seeker", plan: "free", balance: 0, monthlyAllowance: 3, monthlyCreditsRemaining: 1, monthlyCycleKey: currentMonthlyCycleKey(now) });

      const db = await import("../server/db");
      const { createCoverageDeliverySweep } = await import("../server/coverageDeliverySweep");
      const sweep = createCoverageDeliverySweep();
      const spends = () => fx.select().from(tokenTransactions).where(and(eq(tokenTransactions.userId, seeker.id), eq(tokenTransactions.kind, "credit_spend")));
      const events = (action: string) => fx.select().from(referralTransitionEvents).where(and(eq(referralTransitionEvents.referralRequestId, ask.id), eq(referralTransitionEvents.action, action)));
      const request = async () => (await fx.select().from(referralRequests).where(eq(referralRequests.id, ask.id)))[0];
      const wallet = async () => (await fx.select().from(tokenBalances).where(eq(tokenBalances.userId, seeker.id)))[0];

      // 1. Before consent: two hourly retries charge nothing and ask for confirmation once.
      expect(await db.tryDeliverWaitingAsk(ask.id, now.getTime())).toMatchObject({ outcome: "awaiting_reconfirm", requestId: ask.id });
      await sweep({ nowMs: now.getTime() } as Parameters<typeof sweep>[0]);
      expect(await spends()).toHaveLength(0);
      expect((await wallet()).monthlyCreditsRemaining).toBe(1);
      expect(await events("reconfirm_requested")).toHaveLength(1);
      expect(await fx.select().from(notifications).where(and(eq(notifications.userId, seeker.id), eq(notifications.kind, "ask_reconfirm")))).toHaveLength(1);
      expect(await request()).toMatchObject({ status: "pending", waitingForCoverage: true, debitTransactionId: null });

      // 2. The seeker confirms: the request is delivered and charged once, under the existing delivery key.
      expect(await db.reconfirmWaitingAsk(seeker.id, ask.id, now.getTime())).toEqual({ requestId: ask.id, confirmed: true });
      const charged = await spends();
      expect(charged).toHaveLength(1);
      expect(charged[0]).toMatchObject({ tokenCount: -1 });
      expect(charged[0].idempotencyKey).toMatch(new RegExp(`^ask-delivery:${ask.id}(#\\d+)?$`));
      expect((await wallet()).monthlyCreditsRemaining).toBe(0);
      expect(await request()).toMatchObject({ waitingForCoverage: false });
      expect((await request()).debitTransactionId).not.toBeNull();

      // 3. Retries and a repeated confirmation change nothing: still exactly one charge.
      await db.tryDeliverWaitingAsk(ask.id, now.getTime());
      await sweep({ nowMs: now.getTime() } as Parameters<typeof sweep>[0]);
      expect(await db.reconfirmWaitingAsk(seeker.id, ask.id, now.getTime())).toEqual({ requestId: ask.id, confirmed: true });
      expect(await spends()).toHaveLength(1);
      expect(await events("reconfirmed")).toHaveLength(1);
      expect((await wallet()).monthlyCreditsRemaining).toBe(0);
      test.info().annotations.push({ type: "D-411 QA preview", description: `request ${ask.id}: 0 debits before consent, 1 after (${charged[0].idempotencyKey}), 1 after retries` });
    } finally { await fixture.end(); }
  } finally {
    try { if (created) await admin.query(`DROP DATABASE \`${scratch}\``); }
    finally { await admin.end(); }
  }
});
