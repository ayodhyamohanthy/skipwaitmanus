import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  createReferralRequest: vi.fn(),
  reviewReferralRequest: vi.fn(),
  saveProfile: vi.fn(),
}));

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, ...dbMocks };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(): TrpcContext {
  return {
    user: { id: 7, openId: "test-user", name: "Avery Morgan", email: "avery@example.com", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Referral platform backend contracts", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("persists a Referral Request for the authenticated Job Seeker", async () => {
    dbMocks.createReferralRequest.mockResolvedValue({ id: 22 });
    const caller = appRouter.createCaller(context());
    await expect(caller.referrals.create({ jobId: 4, referrerId: 9, personalPitch: "I would bring relevant product design experience and thoughtful systems thinking." })).resolves.toEqual({ id: 22 });
    expect(dbMocks.createReferralRequest).toHaveBeenCalledWith(7, expect.objectContaining({ jobId: 4, referrerId: 9 }));
  });

  it("links only the submitted attachment identifiers to the new Referral Request", async () => {
    dbMocks.createReferralRequest.mockResolvedValue({ id: 23 });
    const caller = appRouter.createCaller(context());
    await expect(caller.referrals.create({ jobId: 4, referrerId: 9, personalPitch: "I would bring relevant product design experience and thoughtful systems thinking.", attachmentIds: [31, 32] })).resolves.toEqual({ id: 23 });
    expect(dbMocks.createReferralRequest).toHaveBeenCalledWith(7, expect.objectContaining({ attachmentIds: [31, 32] }));
  });

  it("records a Referrer decision and optional review message", async () => {
    dbMocks.reviewReferralRequest.mockResolvedValue({ status: "approved" });
    const caller = appRouter.createCaller(context());
    await expect(caller.referrals.review({ requestId: 22, decision: "approved", message: "I’m happy to make this introduction." })).resolves.toEqual({ status: "approved" });
    expect(dbMocks.reviewReferralRequest).toHaveBeenCalledWith(7, expect.objectContaining({ requestId: 22, decision: "approved" }));
  });

  it("persists the exact Job Seeker and Referrer role values on a profile", async () => {
    dbMocks.saveProfile.mockResolvedValue({ id: 3, accountType: "job_seeker" });
    const caller = appRouter.createCaller(context());
    await caller.profile.save({ accountType: "job_seeker", headline: "Product Designer" });
    expect(dbMocks.saveProfile).toHaveBeenCalledWith(7, expect.objectContaining({ accountType: "job_seeker", headline: "Product Designer" }));
  });
});
