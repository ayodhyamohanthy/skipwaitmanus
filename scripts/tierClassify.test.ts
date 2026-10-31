import { describe, expect, it } from "vitest";
import { classifyTier, tierReasonPaths } from "./tierClassifyCore.mjs";

// GATE-tier-floor (D-212): the tier is computed from the changed paths, not only declared, so a money
// or sign-in change filed as Tier 2 still raises the computed tier to 1.

describe("GATE-tier-floor: the pure classifier on each listed Tier 1 path", () => {
  const database = ["drizzle/0101_new_table.sql", "drizzle/meta/_journal.json"];
  const money = [
    "server/creditLedger.ts", "server/payments.ts", "server/paymentWebhooks.ts", "server/chargebee.ts",
    "server/chargebeeRoutes.ts", "server/chargebeeAccountApi.ts", "server/paymentRefundReview.ts",
    "server/paymentRefundEvents.ts", "server/cardValidation.ts", "server/dailyMoneyCheck.ts",
    "server/coverageDelivery.ts", "server/heldAsk.ts",
  ];
  const signIn = [
    "server/_core/workosAuth.ts", "server/_core/sdk.ts", "server/_core/otpLogin.ts",
    "server/_core/seekerEmailCode.ts", "server/_core/context.ts", "server/_core/reviewerLogin.ts",
    "server/_core/devAuth.ts", "server/_core/sessionRenewal.ts", "server/passwordResetRoutes.ts",
    "server/workosWebhooks.ts", "server/workEmailOtp.ts",
  ];
  const privacy = [
    "server/referrerDocumentAccess.ts", "server/referrerAskView.ts", "shared/referrerAskView.ts",
    "server/blockedPairs.ts", "server/privateReferralRoutes.ts",
  ];
  const secrets = ["src/worker.ts"];
  const sharedMoney = [
    "shared/creditLedger.ts", "shared/planCatalog.ts", "shared/planFamily.ts", "shared/moneyCopy.ts",
    "shared/referrerPurchases.ts",
  ];
  const clientSurfaces = [
    "client/src/components/GoogleSignIn.tsx", "client/src/components/SeekerSignInCard.tsx",
    "client/src/pages/SignIn.tsx", "client/src/pages/ReferrerSignIn.tsx", "client/src/pages/Ask.tsx",
    "client/src/pages/MyCompanyInbox.tsx", "client/src/pages/Plans.tsx", "client/src/pages/PlansBilling.tsx",
    "client/src/components/plans/UpgradeMoment.tsx",
  ];

  for (const [label, paths] of Object.entries({ database, money, signIn, privacy, secrets, sharedMoney, clientSurfaces })) {
    it(`classifies every ${label} path as Tier 1`, () => {
      for (const path of paths) {
        expect(classifyTier([path]).tier, path).toBe(1);
        expect(tierReasonPaths([path]), path).toContain(path);
      }
    });
  }
});

describe("GATE-tier-floor: #437's file list (password sign-in for reviewer accounts)", () => {
  // The shape #437 shipped: session keys, sign-in routes, the login dialog and its own test.
  const changed = [
    "server/_core/sdk.ts",
    "server/_core/workosAuth.ts",
    "server/passwordResetRoutes.ts",
    "client/src/components/SignInDialog.tsx",
    "client/src/components/SignInDialog.test.tsx",
    "shared/constants.ts",
  ];
  it("classifies the whole list as Tier 1 and says which paths raised it", () => {
    expect(classifyTier(changed).tier).toBe(1);
    expect(classifyTier(changed).reason).toBe("Tier 1 paths");
    const reasons = tierReasonPaths(changed);
    expect(reasons).toEqual(expect.arrayContaining([
      "server/_core/sdk.ts", "server/_core/workosAuth.ts", "server/passwordResetRoutes.ts", "client/src/components/SignInDialog.tsx",
    ]));
    // A test file adds no reason of its own: its Tier 1 surface already counts.
    expect(reasons).not.toContain("client/src/components/SignInDialog.test.tsx");
  });
});

describe("GATE-tier-floor: server/db.ts by its changed lines and the function each hunk sits in", () => {
  const change = (added: string[], removed: string[] = [], context: string[] = []) => [
    { path: "server/db.ts", added, removed, context },
  ];

  it("classifies a changed spendCreditsTx( call inside createCompanyReferralRequest as Tier 1", () => {
    const changed = change(["  await spendCreditsTx(tx, seekerId, 1);"], [], ["export async function createCompanyReferralRequest(", "  const tx = await begin();"]);
    expect(classifyTier(changed).tier).toBe(1);
    expect(tierReasonPaths(changed)).toContain("server/db.ts");
  });

  it("classifies a hunk whose function name matches the money rule as Tier 1", () => {
    expect(classifyTier(change(["  const row = 1;"], ["  const row = 0;"], ["export async function markCoverageVisible("])).tier).toBe(1);
  });

  it("classifies an unrelated server/db.ts change as Tier 2", () => {
    const changed = change(["  return rows;"], [], ["export async function listCompanyAlertsByUser("]);
    expect(classifyTier(changed).tier).toBe(2);
    expect(tierReasonPaths(changed)).toEqual([]);
  });
});

describe("GATE-tier-floor: tests-only and docs-only changes", () => {
  it("classifies a tests-only diff as Tier 2, never Tier 1 by a test file alone", () => {
    const tests = ["client/src/pages/ask.test.tsx", "server/db.test.ts", "scripts/reviewGate.test.ts", "client/src/components/SeekerSignIn.test.tsx"];
    expect(classifyTier(tests).tier).toBe(2);
    expect(tierReasonPaths(tests)).toEqual([]);
  });

  it("classifies a docs-only diff as Tier 3", () => {
    const docs = ["docs/BRIEF.md", "docs/plans/GATE-delivery.md", "AGENTS.md", "README.md"];
    expect(classifyTier(docs).tier).toBe(3);
    expect(classifyTier(docs).reason).toBe("docs only");
    expect(tierReasonPaths(docs)).toEqual([]);
  });

  it("classifies an empty diff as Tier 3", () => {
    expect(classifyTier([]).tier).toBe(3);
  });
});

describe("GATE-tier-floor: everything else", () => {
  it("classifies a plain server, shared, client, functions or workflow path as Tier 2", () => {
    for (const path of ["server/jobLinkPreviewRoutes.ts", "shared/askNote.ts", "client/src/pages/Home.tsx", "functions/[[path]].ts", ".github/workflows/deploy-api.yml"]) {
      expect(classifyTier([path]).tier, path).toBe(2);
    }
  });

  it("classifies an unknown top-level file (a root config) as Tier 2", () => {
    expect(classifyTier(["wrangler.jsonc"]).tier).toBe(2);
  });

  it("classifies a Tier 1 path mixed into Tier 2 work as Tier 1, naming only that path", () => {
    const changed = ["server/jobLinkPreviewRoutes.ts", "server/payments.ts"];
    expect(classifyTier(changed).tier).toBe(1);
    expect(tierReasonPaths(changed)).toEqual(["server/payments.ts"]);
  });
});


