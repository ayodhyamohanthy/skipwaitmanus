import { beforeEach, describe, expect, it, vi } from "vitest";
import { StringChunk, is, type SQL } from "drizzle-orm";
import { companyAggregateAccess, companyClaimChallenges, companyDomains, companies, profiles, users, workEmailOtpRateLimits } from "../drizzle/schema";
import { createInMemoryDrizzle, type Cell, type Seed } from "./inMemoryDrizzle.testkit";
const mocks = vi.hoisted(() => ({ db: undefined as any, send: vi.fn(), signal: vi.fn(), company: vi.fn() }));
vi.mock("./db", () => ({ getDb: async () => mocks.db }));
vi.mock("./emailDelivery", () => ({ sendTransactionalEmail: mocks.send }));
// The real limiter runs below; only the DNS lookup and the work-email shape check are stubbed.
vi.mock("./workEmailOtp", async importOriginal => {
  const actual = await importOriginal<typeof import("./workEmailOtp")>();
  return { ...actual, isValidOtpLoginEmail: (email: string) => /^[^@]+@quillmint\.com$/.test(email), hasDeliverableMailDomain: async () => true };
});
vi.mock("./companyResponseSignal", () => ({ loadCompanyResponseSignal: mocks.signal }));
vi.mock("./companyDirectory", () => ({ getCompanyDirectoryEntry: mocks.company }));
import { confirmCompanyClaim, loadCompanyClaimDashboard, sendCompanyClaimLink } from "./companyClaim";
import { limiterKey } from "./workEmailOtp";
const store = createInMemoryDrizzle();
const millis = (value: Cell) => (value instanceof Date ? value.getTime() : Number(value));
/** The real consumeLimits writes its fixed-window counter with `INSERT IGNORE`; emulate that one statement. */
async function execute(statement: SQL) {
  const text = statement.queryChunks.map(chunk => (is(chunk, StringChunk) ? chunk.value.join("") : "")).join("");
  if (!text.includes("INSERT IGNORE INTO workEmailOtpRateLimits")) throw new Error(`in-memory drizzle: unsupported execute: ${text}`);
  // Drizzle keeps each interpolated value as its own raw chunk; the text chunks are StringChunk.
  const [key, windowStart, expiresAt] = statement.queryChunks.filter(chunk => !is(chunk, StringChunk)) as [string, Date, Date];
  const exists = store.rows(workEmailOtpRateLimits).some(row => row.limiterKey === key && millis(row.windowStart) === windowStart.getTime());
  if (exists) return [{ affectedRows: 0 }];
  await store.db.insert(workEmailOtpRateLimits).values({ limiterKey: key, windowStart, hitCount: 1, expiresAt });
  return [{ affectedRows: 1 }];
}
const claimDb = { ...store.db, transaction: <T>(run: (tx: unknown) => Promise<T>) => store.db.transaction(tx => run({ ...tx, execute })) };
const company = { name: "Quillmint", slug: "quillmint", domains: ["quillmint.com"], openToReferrals: true };
const base: Seed = [
  [companies, [{ id: 1, slug: "quillmint", status: "listed" }]],
  [companyDomains, [{ id: 1, companyId: 1, domain: "quillmint.com", isPrimary: true }]],
];
/** A limiter row already sitting at `hitCount` in the fixed window that contains now. */
function limitRow(key: string, windowMs: number, hitCount: number) {
  const start = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  return { limiterKey: key, windowStart: start, hitCount, expiresAt: new Date(start.getTime() + windowMs) };
}
beforeEach(() => {
  mocks.db = claimDb; mocks.send.mockReset().mockResolvedValue({ sent: true });
  mocks.signal.mockReset().mockResolvedValue({ state: "insufficient" }); mocks.company.mockReset().mockResolvedValue(company);
  store.reset(base);
});
async function issue(userId = 7, email = "person@quillmint.com") {
  await sendCompanyClaimLink(userId, email);
  const body = mocks.send.mock.calls[0][0].text as string;
  return /token=([a-f0-9]{64})/.exec(body)![1];
}
describe("company mailbox proof and aggregate privacy", () => {
  it("sends a canonical single-use link, bound to the requesting account", async () => {
    const token = await issue();
    await expect(confirmCompanyClaim(8, token)).rejects.toMatchObject({ status: 400 });
    expect(await confirmCompanyClaim(7, token)).toEqual({ slug: "quillmint" });
    await expect(confirmCompanyClaim(7, token)).rejects.toMatchObject({ status: 400 });
  });
  it("rejects expired links at the expiry filter, with the company still listed", async () => {
    const { createHash } = await import("node:crypto"); const token = "b".repeat(64);
    const issuedAt = new Date(Date.now() - 11 * 60_000);
    store.reset([...base, [companyClaimChallenges, [{ id: 1, userId: 7, domain: "quillmint.com", tokenHash: createHash("sha256").update(token).digest("hex"), createdAt: issuedAt, expiresAt: new Date(issuedAt.getTime() + 600_000), consumedAt: null }]]]);
    // The company is available, so only the expiry filter can reject this link.
    await expect(confirmCompanyClaim(7, token)).rejects.toMatchObject({ status: 400, message: "This verification link is invalid or expired" });
  });
  it("issues a link that expires ten minutes after it was created", async () => {
    await issue();
    const [challenge] = store.rows(companyClaimChallenges);
    expect(Math.abs(millis(challenge.expiresAt) - millis(challenge.createdAt) - 600_000)).toBeLessThanOrEqual(5_000);
  });
  it("allows one link request per user per ten minutes", async () => {
    store.reset([...base, [workEmailOtpRateLimits, [limitRow(limiterKey("company-claim-user", "7"), 600_000, 1)]]]);
    await expect(sendCompanyClaimLink(7, "person@quillmint.com")).rejects.toMatchObject({ status: 429 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("allows eight link requests per domain per ten minutes", async () => {
    store.reset([...base, [workEmailOtpRateLimits, [limitRow(limiterKey("company-claim-domain", "quillmint.com"), 600_000, 8)]]]);
    await expect(sendCompanyClaimLink(19, "person2@quillmint.com")).rejects.toMatchObject({ status: 429 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("allows one hundred link requests per hour across every company", async () => {
    store.reset([...base, [workEmailOtpRateLimits, [limitRow(limiterKey("company-claim-global", "all"), 3_600_000, 100)]]]);
    await expect(sendCompanyClaimLink(19, "person2@quillmint.com")).rejects.toMatchObject({ status: 429 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("still sends below the thresholds and counts the hit", async () => {
    store.reset([...base, [workEmailOtpRateLimits, [limitRow(limiterKey("company-claim-domain", "quillmint.com"), 600_000, 7)]]]);
    await expect(sendCompanyClaimLink(7, "person@quillmint.com")).resolves.toEqual({ sent: true });
    const rows = store.rows(workEmailOtpRateLimits);
    expect(rows.find(row => row.limiterKey === limiterKey("company-claim-domain", "quillmint.com"))?.hitCount).toBe(8);
    expect(rows.find(row => row.limiterKey === limiterKey("company-claim-user", "7"))?.hitCount).toBe(1);
  });
  it("rate limits sends and rejects consumer mail", async () => {
    await issue(); await expect(sendCompanyClaimLink(7, "person@quillmint.com")).rejects.toMatchObject({ status: 429 });
    await expect(sendCompanyClaimLink(8, "person@gmail.com")).rejects.toMatchObject({ status: 400 });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("confirms access without touching the profile or the account type", async () => {
    store.reset([...base, [users, [{ id: 7, email: "person@quillmint.com" }]], [profiles, [{ id: 3, userId: 7, accountType: "job_seeker", headline: "Engineer" }]]]);
    const token = await issue();
    const profilesBefore = store.rows(profiles), usersBefore = store.rows(users);
    await expect(confirmCompanyClaim(7, token)).resolves.toEqual({ slug: "quillmint" });
    expect(store.rows(profiles)).toEqual(profilesBefore);
    expect(store.rows(profiles)[0]).toMatchObject({ accountType: "job_seeker" });
    expect(store.rows(users)).toEqual(usersBefore);
  });
  it("cannot load another company's aggregates and never leaks an individual", async () => {
    await expect(loadCompanyClaimDashboard(7, "quillmint")).rejects.toMatchObject({ status: 403 });
    expect(mocks.signal).not.toHaveBeenCalled();
    store.reset([[companyAggregateAccess, [{ id: 1, userId: 7, domain: "quillmint.com" }]]]);
    const result = await loadCompanyClaimDashboard(7, "quillmint");
    expect(result).toEqual({ company: { name: "Quillmint", slug: "quillmint", domain: "quillmint.com", openToReferrals: true }, signal: { state: "insufficient" } });
    expect(JSON.stringify(result)).not.toMatch(/userId|email|resume|seeker|messages|referrerId/);
  });
});

it("keeps claim tokens out of sign-in returnTo and replay analytics initialization", async () => {
  const { readFileSync } = await import("node:fs");
  const ui = readFileSync("client/src/pages/CompanyClaim.tsx", "utf8");
  expect(ui).not.toContain("window.location.pathname + window.location.search + window.location.hash");
  expect(ui).toContain('window.history.replaceState(null, "", window.location.pathname)');
  expect(readFileSync("client/src/lib/clarity.ts", "utf8")).toContain("company\\/claim");
});
