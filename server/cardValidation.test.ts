import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCustomer: vi.fn(async () => "cb_new_1"),
  createManagePaymentSourcesPage: vi.fn(async () => ({ url: "https://skipwait.chargebee.com/pages/v3/hp_cv_1/", hostedPageId: "hp_cv_1" })),
  listPaymentSources: vi.fn(async () => []),
  getUserChargebeeCustomerId: vi.fn(async (): Promise<string | undefined> => "cb_existing_1"),
  setUserChargebeeCustomerId: vi.fn(async () => undefined),
  markCardValidatedFromProvider: vi.fn(async () => undefined),
  recordOperationalActivity: vi.fn(async () => undefined),
}));

vi.mock("./billingSettings", () => ({ freeCreditsRequireCardValidation: () => true }));
vi.mock("./chargebeeAccountApi", () => ({ createCustomer: mocks.createCustomer, createManagePaymentSourcesPage: mocks.createManagePaymentSourcesPage, listPaymentSources: mocks.listPaymentSources }));
vi.mock("./chargebeeEnvironment", () => ({ resolveChargebeeRuntime: () => ({ site: "skipwait", apiKey: "test-key" }) }));
vi.mock("./db", () => ({ getUserChargebeeCustomerId: mocks.getUserChargebeeCustomerId, setUserChargebeeCustomerId: mocks.setUserChargebeeCustomerId, markCardValidatedFromProvider: mocks.markCardValidatedFromProvider, recordOperationalActivity: mocks.recordOperationalActivity }));

import { createCardValidationPageForUser } from "./cardValidation";

describe("card validation page coverage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records the provider hosted page id so reconciliation can classify it", async () => {
    const result = await createCardValidationPageForUser({ userId: 7, origin: "https://skipwait.me" });
    expect(result.url).toBe("https://skipwait.chargebee.com/pages/v3/hp_cv_1/");
    expect(mocks.recordOperationalActivity).toHaveBeenCalledWith({ actorUserId: 7, action: "billing.card_validation_page_created", outcome: "success", resourceType: "chargebee_hosted_page", resourceId: "hp_cv_1" });
  });

  it("still returns the page url when the activity record fails", async () => {
    mocks.recordOperationalActivity.mockRejectedValueOnce(new Error("db down"));
    const result = await createCardValidationPageForUser({ userId: 7, origin: "https://skipwait.me" });
    expect(result.url).toContain("hp_cv_1");
  });

  it("creates and links a provider customer on first use, then records the page", async () => {
    mocks.getUserChargebeeCustomerId.mockResolvedValueOnce(undefined).mockResolvedValueOnce("cb_new_1");
    await createCardValidationPageForUser({ userId: 8, email: "a@b.c", name: "A B", origin: "https://skipwait.me" });
    expect(mocks.createCustomer).toHaveBeenCalledOnce();
    expect(mocks.setUserChargebeeCustomerId).toHaveBeenCalledWith(8, "cb_new_1");
    expect(mocks.recordOperationalActivity).toHaveBeenCalledOnce();
  });
});
