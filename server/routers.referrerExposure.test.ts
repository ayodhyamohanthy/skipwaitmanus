import { beforeEach, describe, expect, it, vi } from "vitest";

// P0-referrer-exposure: referrers were promised "Never ranked. Never public." and stay
// anonymous until they accept, so neither the referrer list nor AI referrer matching
// may answer anyone but an administrator.
const dbMocks = vi.hoisted(() => ({ listReferrers: vi.fn(), getAiWorkspaceContext: vi.fn() }));
const aiMocks = vi.hoisted(() => ({ matchReferrers: vi.fn() }));

vi.mock("./ai", async importOriginal => ({ ...(await importOriginal<typeof import("./ai")>()), ...aiMocks }));
vi.mock("./db", async importOriginal => ({ ...(await importOriginal<typeof import("./db")>()), ...dbMocks }));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type Account = NonNullable<TrpcContext["user"]>;
const account = (id: number, role: Account["role"]): Account => ({ id, openId: `account-${id}`, canonicalPersonId: null, name: null, email: `member${id}@example.com`, loginMethod: "workos", role, suspended: false, sessionsValidAfter: new Date(0), createdAt: new Date(0), updatedAt: new Date(0), lastSignedIn: new Date(0) });
const callerFor = (user: Account | null) => appRouter.createCaller({ user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });

// One row as community.listReferrers returned it to any account: the name is the
// work email's local part, so with the company it rebuilds the referrer's work email.
const referrerRows = [{ userId: 41, name: "zoya.quill", company: "quasar-ledgers.com", title: "Principal Payments Engineer", location: "Lisbon", expertise: "ledger reconciliation", capacity: 3, headline: "Payments at Quasar" }];
const role = { jobTitle: "Staff Engineer", company: "quasar-ledgers.com" };
const stats = { savedRoles: 0, activeReferralRequests: 0, incomingReferralRequests: 0, introductionsMade: 0, conversationsStarted: 0, peopleHired: 0 };

describe("referrer listing and AI referrer matching are administrator-only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.listReferrers.mockResolvedValue(referrerRows);
    dbMocks.getAiWorkspaceContext.mockResolvedValue({ profile: null, jobs: [], referrers: [], savedRoles: [], referrals: [], recentMessageCount: 0, stats });
    aiMocks.matchReferrers.mockResolvedValue({ strategy: "No referrer data is available to AI.", matches: [] });
  });

  it("refuses the referrer list to every signed-in member without reading a row", async () => {
    const member = callerFor(account(12, "user"));
    await expect(member.community.listReferrers()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.community.listReferrers({ company: "quasar-ledgers.com", role: "Engineer" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(null).community.listReferrers()).rejects.toMatchObject({ code: expect.stringMatching(/^(UNAUTHORIZED|FORBIDDEN)$/) });
    expect(dbMocks.listReferrers).not.toHaveBeenCalled();
  });

  it("refuses AI referrer matching to members before any workspace read or model call", async () => {
    await expect(callerFor(account(12, "user")).ai.matchReferrers(role)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(null).ai.matchReferrers(role)).rejects.toMatchObject({ code: expect.stringMatching(/^(UNAUTHORIZED|FORBIDDEN)$/) });
    expect(dbMocks.getAiWorkspaceContext).not.toHaveBeenCalled();
    expect(aiMocks.matchReferrers).not.toHaveBeenCalled();
  });

  it("still answers an administrator", async () => {
    const admin = callerFor(account(1, "admin"));
    await expect(admin.community.listReferrers({ company: "quasar-ledgers.com" })).resolves.toEqual(referrerRows);
    expect(dbMocks.listReferrers).toHaveBeenCalledWith({ company: "quasar-ledgers.com" });
    await expect(admin.ai.matchReferrers(role)).resolves.toEqual({ strategy: "No referrer data is available to AI.", matches: [] });
    expect(dbMocks.getAiWorkspaceContext).toHaveBeenCalledWith(1);
  });
});
