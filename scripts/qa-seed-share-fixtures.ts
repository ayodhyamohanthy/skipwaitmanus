/*
 * Seed the QA preview (skipwait-qa) with the share/signal fixtures QA asked for
 * (Oct 21): fictional company Quillmint with 3+ verified referrers; referrer A
 * with 3 answered asks (impact card visible, 1 intro made), referrer B with 2
 * answered asks (card hidden by the min-3 gate); a seeker with an accepted ask
 * (win card state). FICTIONAL data only, for a scratch database.
 *
 * Guard: refuses to run unless the DATABASE_URL database name contains "qa"
 * (case-insensitive) or SKIPWAIT_QA_SEED_CONFIRM=yes is set. Never point this
 * at prod.
 *
 * Run: DATABASE_URL=mysql://user:pass@host/skipwait_qa npx tsx scripts/qa-seed-share-fixtures.ts
 */
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { companies, companyDomains, jobs, profiles, referralRequests, referralTransitionEvents, referrerFastTrackLinks, users } from "../drizzle/schema";

const url = process.env.DATABASE_URL ?? "";
const dbName = /\/([^/?]+)(\?|$)/.exec(url)?.[1] ?? "";
if (!/qa/i.test(dbName) && process.env.SKIPWAIT_QA_SEED_CONFIRM !== "yes") {
  console.error(`Refusing: database "${dbName}" does not look like a QA scratch database. Set SKIPWAIT_QA_SEED_CONFIRM=yes to override.`);
  process.exit(1);
}

const NOW = Date.now();
const ago = (hours: number) => new Date(NOW - hours * 3_600_000);

async function main() {
  const pool = mysql.createPool(url);
  const db = drizzle(pool);

  const [company] = await db.insert(companies).values({ slug: "quillmint", name: "Quillmint", initials: "Q", industry: "Fintech", location: "Bengaluru", functions: JSON.stringify(["Engineering", "Design"]), blurb: "Fictional QA fixture company.", status: "listed", sortOrder: 0 }).$returningId();
  const companyId = company.id;
  await db.insert(companyDomains).values({ companyId, domain: "quillmint.com", isPrimary: true });

  const mkUser = async (openId: string, name: string, email: string) => (await db.insert(users).values({ openId, name, email, loginMethod: "qa-fixture" }).$returningId()).id;

  // Three verified referrers at quillmint.com (+ one more for the company signal's referrer count).
  const referrerIds: number[] = [];
  for (const [index, handle] of ["quietfalcon", "calmpiper", "briskheron", "swiftotter"].entries()) {
    const id = await mkUser(`qa_${handle}`, `QA ${handle}`, `${handle}@quillmint.com`);
    await db.insert(profiles).values({ userId: id, accountType: "referrer", workEmailDomain: "quillmint.com", workEmailVerifiedAt: ago(24 * 30), handle });
    referrerIds.push(id);
  }
  const [refA, refB] = referrerIds;

  // Fast-track links: A has a vanity alias (card shows it), B does not need one.
  await db.insert(referrerFastTrackLinks).values({ referrerId: refA, companyDomain: "quillmint.com", linkCode: "qa-quietfalcon-link", vanityAlias: "QuietFalcon", isActive: true });

  // Seeker with asks.
  const seeker = await mkUser("qa_seeker", "QA Seeker", "seeker@qa-fixtures.invalid");
  const mkJob = async (title: string) => (await db.insert(jobs).values({ title, company: "quillmint.com", targetRoleUrl: `https://careers.quillmint.example/${title.toLowerCase().replaceAll(" ", "-")}`, jobFunction: "engineering", createdAt: ago(72) }).$returningId()).id;

  const mkAsk = async (jobId: number, hoursAgo: number, visibleHoursAgo: number) =>
    (await db.insert(referralRequests).values({ jobId, jobSeekerId: seeker, status: "pending", createdAt: ago(hoursAgo), coverageVisibleAt: ago(visibleHoursAgo) }).$returningId()).id;
  const decide = async (requestId: number, actor: number, action: "approve" | "pass", hoursAgo: number, revision = 1) =>
    db.insert(referralTransitionEvents).values({ referralRequestId: requestId, operationKey: `${action}:${actor}:${requestId}:${revision}`, actorUserId: actor, action, fromStatus: "pending", resultingStatus: action === "approve" ? "approved" : "declined", resultingRevision: revision, createdAt: ago(hoursAgo) });

  // Referrer A: 3 answered asks (2 approve + 1 pass), one progressed to intro_made.
  const a1 = await mkAsk(await mkJob("Backend Engineer"), 50, 49);
  const a2 = await mkAsk(await mkJob("Frontend Engineer"), 40, 39);
  const a3 = await mkAsk(await mkJob("Platform Engineer"), 30, 29);
  await decide(a1, refA, "approve", 46); // ~3h first reply
  await decide(a2, refA, "approve", 34);
  await decide(a3, refA, "pass", 26);
  await db.update(referralRequests).set({ status: "approved" }).where((t, { eq }) => eq(t.id, a1));
  await db.update(referralRequests).set({ status: "approved" }).where((t, { eq }) => eq(t.id, a2));
  await db.insert(referralTransitionEvents).values({ referralRequestId: a1, operationKey: `progress:${refA}:${a1}`, actorUserId: refA, action: "progress", fromStatus: "approved", resultingStatus: "intro_made", resultingRevision: 2, createdAt: ago(20) });

  // Referrer B: 2 answered asks - the impact card must stay HIDDEN (min-3 gate).
  const b1 = await mkAsk(await mkJob("Data Engineer"), 28, 27);
  const b2 = await mkAsk(await mkJob("QA Engineer"), 20, 19);
  await decide(b1, refB, "approve", 22);
  await decide(b2, refB, "pass", 16);

  console.log(JSON.stringify({ companyId, referrers: { A: refA, B: refB, others: referrerIds.slice(2) }, seeker, asks: { a1, a2, a3, b1, b2 } }, null, 2));
  await pool.end();
}

main().catch(error => { console.error(error); process.exit(1); });
