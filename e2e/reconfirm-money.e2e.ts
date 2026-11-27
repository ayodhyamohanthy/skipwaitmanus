// D-174-no-expiry-release, packet §7 step 1 as ruled by D-411 (3): the QA preview of reconfirm-before-spend.
// Real server code, real MySQL, fictional accounts, no provider call and no real money. A waiting referral
// request created 31 days ago, whose seeker holds one fresh free credit, is not charged by the hourly
// coverage-delivery retry until the seeker confirms it; after the confirmation it is charged exactly once,
// however many retries follow. The journey runs on the release head, where ASK_RECONFIRM_ENABLED and
// ASK_NO_EXPIRY_ENABLED are both on.
//
// Like review-email-retry.e2e.ts, it uses the local e2e database (the server module caches one connection per
// worker, so a second database would leak into later journeys), seeds its own rows under a unique fictional company
// domain and acts only on its own request: the hourly sweep's unit of work, tryDeliverWaitingAsk, is called for this
// request id alone, so no other journey's waiting request is ever delivered.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { test, expect } from "playwright/test";
import { jobs, notifications, profiles, referralRequests, referralTransitionEvents, tokenBalances, tokenTransactions, users } from "../drizzle/schema";
import { ASK_RECONFIRM_ENABLED } from "../shared/askReconfirm";
import { ASK_NO_EXPIRY_ENABLED } from "../shared/askNoExpiry";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";

const target = new URL(process.env.E2E_DATABASE_URL || "mysql://root:e2e@127.0.0.1:3306/skipwait");
if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.pathname !== "/skipwait") throw new Error("The reconfirm QA journey requires the local e2e database");
process.env.DATABASE_URL = target.href;

const DAY = 86_400_000;

test("a 31-day-old waiting request is charged only after the seeker confirms, then exactly once", async () => {
  expect(ASK_RECONFIRM_ENABLED, "the release turns reconfirm-before-spend on").toBe(true);
  expect(ASK_NO_EXPIRY_ENABLED, "the release turns the ask clocks off together with it").toBe(true);

  const db = await import("../server/db");
  const fx = await db.getDb();
  if (!fx) throw new Error("Local e2e MySQL is unavailable");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const DOMAIN = `reconfirm-${suffix}.example`;
  process.env.BANDED_SALES_ENABLED = "false";
  const now = new Date();
  const createdAt = new Date(now.getTime() - 31 * DAY);
  const [seeker] = await fx.insert(users).values({ openId: `qa-reconfirm-seeker-${suffix}`, name: "QA Seeker", email: `qa-seeker-${suffix}@example.invalid`, loginMethod: "test_seed" }).$returningId();
  const [referrer] = await fx.insert(users).values({ openId: `qa-reconfirm-referrer-${suffix}`, name: "QA Referrer", email: `qa-referrer@${DOMAIN}`, loginMethod: "test_seed" }).$returningId();
  await fx.insert(profiles).values({ userId: referrer.id, accountType: "referrer", workEmail: `qa-referrer@${DOMAIN}`, workEmailDomain: DOMAIN, workEmailVerifiedAt: now, paused: false, referralCapacity: 3 });
  const [job] = await fx.insert(jobs).values({ company: DOMAIN, title: "QA Engineer", location: "Remote", seniority: "Mid", employmentType: "Full-time", workMode: "Remote", description: "Fictional QA job for the reconfirm journey.", targetRoleUrl: `https://careers.${DOMAIN}/job/1` }).$returningId();
  const [ask] = await fx.insert(referralRequests).values({ jobId: job.id, jobSeekerId: seeker.id, personalPitch: "Fictional QA request.", status: "pending", waitingForCoverage: true, coverageQueuedAt: createdAt, coverageHeldAt: null, createdAt, updatedAt: createdAt }).$returningId();
  await fx.insert(tokenBalances).values({ userId: seeker.id, role: "job_seeker", plan: "free", balance: 0, monthlyAllowance: 3, monthlyCreditsRemaining: 1, monthlyCycleKey: currentMonthlyCycleKey(now) });

  const spends = () => fx.select().from(tokenTransactions).where(and(eq(tokenTransactions.userId, seeker.id), eq(tokenTransactions.kind, "credit_spend")));
  const events = (action: string) => fx.select().from(referralTransitionEvents).where(and(eq(referralTransitionEvents.referralRequestId, ask.id), eq(referralTransitionEvents.action, action)));
  const request = async () => (await fx.select().from(referralRequests).where(eq(referralRequests.id, ask.id)))[0];
  const wallet = async () => (await fx.select().from(tokenBalances).where(eq(tokenBalances.userId, seeker.id)))[0];

  // 1. Before consent: two hourly retries charge nothing and ask for confirmation once.
  expect(await db.tryDeliverWaitingAsk(ask.id, now.getTime())).toMatchObject({ outcome: "awaiting_reconfirm", requestId: ask.id });
  expect(await db.tryDeliverWaitingAsk(ask.id, now.getTime() + 3_600_000)).toMatchObject({ outcome: "awaiting_reconfirm", requestId: ask.id });
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
  await db.tryDeliverWaitingAsk(ask.id, now.getTime() + 3_600_000);
  expect(await db.reconfirmWaitingAsk(seeker.id, ask.id, now.getTime())).toEqual({ requestId: ask.id, confirmed: true });
  expect(await spends()).toHaveLength(1);
  expect(await events("reconfirmed")).toHaveLength(1);
  expect((await wallet()).monthlyCreditsRemaining).toBe(0);
  test.info().annotations.push({ type: "D-411 QA preview", description: `request ${ask.id}: 0 debits before consent, 1 after (${charged[0].idempotencyKey}), 1 after retries` });
});
