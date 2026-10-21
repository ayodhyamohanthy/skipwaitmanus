import { beforeEach, describe, expect, it, vi } from "vitest";
import { companyAggregateAccess, companyClaimChallenges, companyDomains, companies } from "../drizzle/schema";
import { createInMemoryDrizzle } from "./inMemoryDrizzle.testkit";
const mocks = vi.hoisted(() => ({ db: undefined as any, send: vi.fn(), signal: vi.fn(), company: vi.fn() }));
vi.mock("./db", () => ({ getDb: async () => mocks.db }));
vi.mock("./emailDelivery", () => ({ sendTransactionalEmail: mocks.send }));
vi.mock("./workEmailOtp", () => ({ isValidOtpLoginEmail: (email: string) => /^[^@]+@quillmint\.com$/.test(email), hasDeliverableMailDomain: async () => true, consumeLimits: async () => {}, limiterKey: (a: string, b: string) => `${a}:${b}` }));
vi.mock("./companyResponseSignal", () => ({ loadCompanyResponseSignal: mocks.signal }));
vi.mock("./companyDirectory", () => ({ getCompanyDirectoryEntry: mocks.company }));
import { confirmCompanyClaim, loadCompanyClaimDashboard, sendCompanyClaimLink } from "./companyClaim";
const store = createInMemoryDrizzle();
const company = { name: "Quillmint", slug: "quillmint", domains: ["quillmint.com"], openToReferrals: true };
beforeEach(() => {
  mocks.db = store.db; mocks.send.mockReset().mockResolvedValue({ sent: true });
  mocks.signal.mockReset().mockResolvedValue({ state: "insufficient" }); mocks.company.mockReset().mockResolvedValue(company);
  store.reset([[companies, [{ id: 1, slug: "quillmint", status: "listed" }]], [companyDomains, [{ id: 1, companyId: 1, domain: "quillmint.com", isPrimary: true }]]]);
});
async function issue() {
  await sendCompanyClaimLink(7, "person@quillmint.com");
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
  it("rejects expired links", async () => {
    const { createHash } = await import("node:crypto"); const token = "b".repeat(64);
    store.reset([[companyClaimChallenges, [{ id: 1, userId: 7, domain: "quillmint.com", tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(0), consumedAt: null }]]]);
    await expect(confirmCompanyClaim(7, token)).rejects.toMatchObject({ status: 400 });
  });
  it("rate limits sends and rejects consumer mail", async () => {
    await issue(); await expect(sendCompanyClaimLink(7, "person@quillmint.com")).rejects.toMatchObject({ status: 429 });
    await expect(sendCompanyClaimLink(8, "person@gmail.com")).rejects.toMatchObject({ status: 400 });
    expect(mocks.send).toHaveBeenCalledTimes(1);
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
