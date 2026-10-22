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
import { eq } from "drizzle-orm";
import mysql from "mysql2/promise";
import { companies, companyDomains, jobs, profiles, referralRequestPasses, referralRequests, referralTransitionEvents, referrerFastTrackLinks, users } from "../drizzle/schema";

const url = process.env.DATABASE_URL ?? "";
const dbName = /\/([^/?]+)(\?|$)/.exec(url)?.[1] ?? "";
if (!/qa/i.test(dbName) && process.env.SKIPWAIT_QA_SEED_CONFIRM !== "yes") {
  console.error(`Refusing: database "${dbName}" does not look like a QA scratch database. Set SKIPWAIT_QA_SEED_CONFIRM=yes to override.`);
  process.exit(1);
}

const NOW = Date.now();
const ago = (hours: number) => new Date(NOW - hours * 3_600_000);

async function main() {
  // Azure Database for MySQL enforces TLS (require_secure_transport=ON); parse
  // the URL and pass ssl explicitly, same as drizzle.config.ts.
  const parsed = new URL(url);
  const pool = mysql.createPool({
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: dbName,
    ssl: { rejectUnauthorized: false },
  });
  const db = drizzle(pool);

  // Idempotent: remove any previous fixture rows (a failed earlier run leaves
  // partial fixtures). Scratch DB only; guards above already proved that.
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  await pool.query("DELETE p FROM referralRequestPasses p JOIN referralRequests r ON p.referralRequestId = r.id JOIN jobs j ON r.jobId = j.id WHERE j.company = 'quillmint.com'");
  await pool.query("DELETE e FROM referralTransitionEvents e JOIN referralRequests r ON e.referralRequestId = r.id JOIN jobs j ON r.jobId = j.id WHERE j.company = 'quillmint.com'");
  await pool.query("DELETE r FROM referralRequests r JOIN jobs j ON r.jobId = j.id WHERE j.company = 'quillmint.com'");
  await pool.query("DELETE FROM jobs WHERE company = 'quillmint.com'");
  await pool.query("DELETE FROM referrerFastTrackLinks WHERE companyDomain = 'quillmint.com'");
  await pool.query("DELETE p FROM profiles p JOIN users u ON p.userId = u.id WHERE u.openId LIKE 'qa_%'");
  await pool.query("DELETE p FROM profiles p JOIN users u ON p.userId = u.id WHERE u.email LIKE '%@qa-fixtures.invalid'");
  await pool.query("DELETE FROM users WHERE openId LIKE 'qa_%' OR email LIKE '%@qa-fixtures.invalid'");
  await pool.query("DELETE d FROM companyDomains d JOIN companies c ON d.companyId = c.id WHERE c.slug = 'quillmint'");
  await pool.query("DELETE FROM companies WHERE slug = 'quillmint'");
  await pool.query("SET FOREIGN_KEY_CHECKS = 1");

  const [company] = await db.insert(companies).values({ slug: "quillmint", name: "Quillmint", initials: "Q", industry: "Fintech", location: "Bengaluru", functions: JSON.stringify(["Engineering", "Design"]), blurb: "Fictional QA fixture company.", status: "listed", sortOrder: 0 }).$returningId();
  const companyId = company.id;
  await db.insert(companyDomains).values({ companyId, domain: "quillmint.com", isPrimary: true });

  const mkUser = async (openId: string, name: string, email: string) => (await db.insert(users).values({ openId, name, email, loginMethod: "qa-fixture" }).$returningId())[0].id;

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
  const mkJob = async (title: string) => (await db.insert(jobs).values({ title, company: "quillmint.com", location: "Bengaluru (fictional)", seniority: "mid", employmentType: "full-time", workMode: "hybrid", description: `Fictional QA fixture role: ${title}.`, targetRoleUrl: `https://careers.quillmint.example/${title.toLowerCase().replaceAll(" ", "-")}`, jobFunction: "engineering", createdAt: ago(72) }).$returningId())[0].id;

  const mkAsk = async (jobId: number, hoursAgo: number, visibleHoursAgo: number) =>
    (await db.insert(referralRequests).values({ jobId, jobSeekerId: seeker, status: "pending", personalPitch: "Fictional QA fixture pitch.", createdAt: ago(hoursAgo), coverageVisibleAt: ago(visibleHoursAgo) }).$returningId())[0].id;
  const decide = async (requestId: number, actor: number, action: "approve" | "pass", hoursAgo: number, revision = 1) =>
    db.insert(referralTransitionEvents).values({ referralRequestId: requestId, operationKey: `${action}:${actor}:${requestId}:${revision}`, actorUserId: actor, action, fromStatus: "pending", resultingStatus: action === "approve" ? "approved" : "declined", resultingRevision: revision, createdAt: ago(hoursAgo) });

  // Referrer A: 3 answered asks (2 approve + 1 pass), one progressed to intro_made.
  const a1 = await mkAsk(await mkJob("Backend Engineer"), 50, 49);
  const a2 = await mkAsk(await mkJob("Frontend Engineer"), 40, 39);
  const a3 = await mkAsk(await mkJob("Platform Engineer"), 30, 29);
  await decide(a1, refA, "approve", 46); // ~3h first reply
  await decide(a2, refA, "approve", 34);
  await decide(a3, refA, "pass", 26);
  await db.update(referralRequests).set({ status: "approved", referrerId: refA, revision: 1 }).where(eq(referralRequests.id, a1));
  await db.update(referralRequests).set({ status: "approved", referrerId: refA, revision: 1 }).where(eq(referralRequests.id, a2));
  await db.insert(referralTransitionEvents).values({ referralRequestId: a1, operationKey: `progress:${refA}:${a1}`, actorUserId: refA, action: "progress", fromStatus: "approved", resultingStatus: "intro_made", resultingRevision: 2, createdAt: ago(20) });
  await db.update(referralRequests).set({ status: "intro_made", revision: 2 }).where(eq(referralRequests.id, a1));
  // A pass releases the ask (status stays pending, no referrerId) and is recorded
  // in referralRequestPasses so it never reappears in the passing referrer's queue.
  await db.insert(referralRequestPasses).values({ referralRequestId: a3, referrerId: refA, reason: "cannot_support", createdAt: ago(26) });

  // Referrer B: 2 answered asks - the impact card must stay HIDDEN (min-3 gate).
  const b1 = await mkAsk(await mkJob("Data Engineer"), 28, 27);
  const b2 = await mkAsk(await mkJob("QA Engineer"), 20, 19);
  await decide(b1, refB, "approve", 22);
  await db.update(referralRequests).set({ status: "approved", referrerId: refB, revision: 1 }).where(eq(referralRequests.id, b1));
  await decide(b2, refB, "pass", 16);
  await db.insert(referralRequestPasses).values({ referralRequestId: b2, referrerId: refB, reason: "cannot_support", createdAt: ago(16) });

  console.log(JSON.stringify({ companyId, referrers: { A: refA, B: refB, others: referrerIds.slice(2) }, seeker, asks: { a1, a2, a3, b1, b2 } }, null, 2));
  await pool.end();
}

main().catch(error => { console.error(error); process.exit(1); });
