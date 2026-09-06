import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";
import { getLastReconcileError, getLastReconcileResults, isSchemaReconciled, reconcileSchema } from "./schemaReconcile";

vi.mock("./schemaReconcile", () => ({
  reconcileSchema: vi.fn(),
  isSchemaReconciled: vi.fn(),
  getLastReconcileError: vi.fn(),
  getLastReconcileResults: vi.fn(),
}));

const adminIdentity = { account: { id: 1, openId: "workos_admin", role: "admin" as const }, primaryEmail: { emailAddress: "admin@skipwait.me" } };
const userIdentity = { account: { id: 2, openId: "workos_user", role: "user" as const } };

function baseDeps(resolveIdentity: PrivateReferralRouteDeps["resolveIdentity"]): PrivateReferralRouteDeps {
  return {
    resolveIdentity,
    dataUrlToBuffer: () => Buffer.alloc(0),
    sanitizeDocumentName: (fileName: string) => fileName,
    storagePut: async () => ({ key: "test-key" }),
    storageGetSignedUrl: async () => "https://signed.test/key",
    createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 1 }),
    createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 1 }),
    listCompanyReferralInbox: async () => [],
    claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }),
    getClaimedCompanyReferralDetail: async () => undefined,
    listPublicCompanyOpportunities: async () => [],
    publishCompanyOpportunity: async () => ({}),
  };
}

function buildApp(deps: PrivateReferralRouteDeps) {
  const app = express();
  app.use(express.json());
  registerPrivateReferralRoutes(app, deps);
  return app;
}

beforeEach(() => {
  vi.mocked(reconcileSchema).mockReset().mockResolvedValue({ applied: [], skipped: [] });
  vi.mocked(isSchemaReconciled).mockReset().mockReturnValue(false);
  vi.mocked(getLastReconcileError).mockReset().mockReturnValue(null);
  vi.mocked(getLastReconcileResults).mockReset().mockReturnValue([]);
});

describe("admin schema reconcile routes", () => {
  it("rejects a non-admin with 403 on both inspect and run without touching the reconciler", async () => {
    const app = buildApp(baseDeps(async () => userIdentity));
    expect((await request(app).get("/api/admin/schema/reconcile")).status).toBe(403);
    expect((await request(app).post("/api/admin/schema/reconcile")).status).toBe(403);
    expect(reconcileSchema).not.toHaveBeenCalled();
  });

  it("returns the last-run snapshot on GET without executing anything", async () => {
    vi.mocked(isSchemaReconciled).mockReturnValue(true);
    vi.mocked(getLastReconcileResults).mockReturnValue([{ statement: "ALTER TABLE `jobs` ADD COLUMN `compensation` TEXT NULL", ok: true }]);
    const app = buildApp(baseDeps(async () => adminIdentity));

    const response = await request(app).get("/api/admin/schema/reconcile");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      reconciled: true,
      results: [{ statement: "ALTER TABLE `jobs` ADD COLUMN `compensation` TEXT NULL", ok: true }],
      firstError: null,
    });
    expect(reconcileSchema).not.toHaveBeenCalled();
  });

  it("runs the allowlisted reconcile on POST and returns per-statement results", async () => {
    vi.mocked(reconcileSchema).mockResolvedValue({ applied: ["jobs.compensation"], skipped: [] });
    vi.mocked(isSchemaReconciled).mockReturnValue(false);
    vi.mocked(getLastReconcileError).mockReturnValue("[ALTER TABLE `jobs` ADD COLUMN `compensation` TEXT NULL] Lock wait timeout exceeded");
    vi.mocked(getLastReconcileResults).mockReturnValue([
      { statement: "ALTER TABLE `jobs` ADD COLUMN `compensation` TEXT NULL", ok: false, error: "Lock wait timeout exceeded" },
      { statement: "ALTER TABLE `referralRequests` ADD COLUMN `savedAt` TIMESTAMP NULL", ok: true },
    ]);
    const app = buildApp(baseDeps(async () => adminIdentity));

    const response = await request(app).post("/api/admin/schema/reconcile");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      reconciled: false,
      firstError: "[ALTER TABLE `jobs` ADD COLUMN `compensation` TEXT NULL] Lock wait timeout exceeded",
      results: [
        { statement: "ALTER TABLE `jobs` ADD COLUMN `compensation` TEXT NULL", ok: false, error: "Lock wait timeout exceeded" },
        { statement: "ALTER TABLE `referralRequests` ADD COLUMN `savedAt` TIMESTAMP NULL", ok: true },
      ],
    });
    expect(reconcileSchema).toHaveBeenCalledTimes(1);
  });

  it("answers 500 when the reconciler itself throws", async () => {
    vi.mocked(reconcileSchema).mockRejectedValue(new Error("db unavailable"));
    const app = buildApp(baseDeps(async () => adminIdentity));

    const response = await request(app).post("/api/admin/schema/reconcile");

    expect(response.status).toBe(500);
  });
});
