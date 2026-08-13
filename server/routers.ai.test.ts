import { beforeEach, describe, expect, it, vi } from "vitest";

const aiMocks = vi.hoisted(() => ({ runCareerCopilot: vi.fn(), draftReferralPitch: vi.fn(), draftHiringManagerEmail: vi.fn(), summarizeReferralFit: vi.fn() }));
const dbMocks = vi.hoisted(() => ({ getProfileByUserId: vi.fn(), getAiWorkspaceContext: vi.fn() }));

vi.mock("./ai", () => aiMocks);
vi.mock("./db", async importOriginal => ({ ...(await importOriginal<typeof import("./db")>()), ...dbMocks }));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(): TrpcContext {
  return { user: { id: 12, openId: "copilot-user", name: "Avery Morgan", email: "avery@example.com", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("Bridge AI contracts", () => {
  beforeEach(() => { vi.clearAllMocks(); dbMocks.getProfileByUserId.mockResolvedValue({ accountType: "job_seeker", headline: "Product Designer", skills: "Figma" }); dbMocks.getAiWorkspaceContext.mockResolvedValue({ profile: { accountType: "job_seeker", headline: "Product Designer", skills: "Figma" }, jobs: [{ id: 2, title: "Senior Product Designer", company: "Northstar", location: "San Francisco, CA", seniority: "Senior", workMode: "Hybrid", description: "Workflow design" }], referrers: [], savedRoles: [], referrals: [], recentMessageCount: 0, stats: { savedRoles: 0, activeReferralRequests: 0, incomingReferralRequests: 0, introductionsMade: 0, conversationsStarted: 0, peopleHired: 0 } }); });

  it("grounds Copilot guidance in the authenticated member profile", async () => {
    aiMocks.runCareerCopilot.mockResolvedValue("Focus on the Northstar role first.");
    const caller = appRouter.createCaller(context());
    await expect(caller.ai.copilot({ message: "What should I focus on this week?" })).resolves.toEqual({ reply: "Focus on the Northstar role first." });
    expect(aiMocks.runCareerCopilot).toHaveBeenCalledWith(expect.objectContaining({ message: "What should I focus on this week?", context: expect.objectContaining({ profile: expect.objectContaining({ headline: "Product Designer" }), jobs: expect.arrayContaining([expect.objectContaining({ title: "Senior Product Designer" })]) }) }));
  });

  it("returns an editable AI draft for a Referral Request", async () => {
    aiMocks.draftReferralPitch.mockResolvedValue("Hi Mira, I’m interested in the role because…");
    const caller = appRouter.createCaller(context());
    await expect(caller.ai.draftReferralPitch({ jobTitle: "Senior Product Designer", company: "Northstar", referrerName: "Mira Shah", notes: "I have workflow design experience." })).resolves.toEqual({ draft: "Hi Mira, I’m interested in the role because…" });
    expect(aiMocks.draftReferralPitch).toHaveBeenCalledWith(expect.objectContaining({ jobTitle: "Senior Product Designer", referrerName: "Mira Shah" }));
  });

  it("generates a Referrer-controlled hiring-manager email from supplied context only", async () => {
    aiMocks.draftHiringManagerEmail.mockResolvedValue("Subject: Referral — Avery\n\nHi Hiring Manager,");
    const caller = appRouter.createCaller(context());
    await expect(caller.ai.draftHiringManagerEmail({ candidateName: "Avery", targetRoleUrl: "https://company.com/jobs/product-designer", accomplished: "improved activation", measuredBy: "24%", byDoing: "redesigning onboarding" })).resolves.toEqual({ draft: "Subject: Referral — Avery\n\nHi Hiring Manager," });
    expect(aiMocks.draftHiringManagerEmail).toHaveBeenCalledWith({ candidateName: "Avery", targetRoleUrl: "https://company.com/jobs/product-designer", accomplished: "improved activation", measuredBy: "24%", byDoing: "redesigning onboarding" });
  });
});
