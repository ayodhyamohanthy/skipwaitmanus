import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
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

  it("rejects the retired direct-referral procedure so a Job Seeker cannot bypass exact-company routing", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.referrals.create({ jobId: 4, referrerId: 9, personalPitch: "I would bring relevant product design experience and thoughtful systems thinking." })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects the retired direct review procedure so Referrer decisions stay bound to claimed requests", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.referrals.review({ requestId: 22, decision: "approved", message: "I’m happy to make this introduction." })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects generic messaging so conversations cannot bypass participant-only accepted referrals", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.messaging.send({ recipientId: 9, body: "Hello" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("persists the exact Job Seeker and Referrer role values on a profile", async () => {
    dbMocks.saveProfile.mockResolvedValue({ id: 3, accountType: "job_seeker" });
    const caller = appRouter.createCaller(context());
    await caller.profile.save({ accountType: "job_seeker", headline: "Product Designer" });
    expect(dbMocks.saveProfile).toHaveBeenCalledWith(7, expect.objectContaining({ accountType: "job_seeker", headline: "Product Designer" }));
  });
});
