import { DrizzleQueryError } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "./db";
import { CompanyConflictError, createCompany, updateCompany } from "./companyDirectoryAdmin";

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn() };
});

/** The shape drizzle 0.45 throws: the mysql2 error sits on `.cause`, not on top. */
function wrappedDuplicate(table: string): DrizzleQueryError {
  const driver = Object.assign(new Error(`Duplicate entry for ${table}`), { code: "ER_DUP_ENTRY", errno: 1062, sqlState: "23000" });
  return new DrizzleQueryError(`insert into \`${table}\``, [], driver);
}

const createInput = {
  name: "Acme Corporation",
  industry: "Technology",
  location: "Global",
  functions: ["Engineering"],
  blurb: "Acme builds things.",
  primaryDomain: "acme.com",
};

afterEach(() => { vi.clearAllMocks(); });

describe("company directory admin duplicate fidelity (FND-3)", () => {
  it("answers a create that races another writer with its intended conflict when the driver error is wrapped", async () => {
    vi.mocked(getDb).mockResolvedValue({ transaction: async () => { throw wrappedDuplicate("companyDomains"); } } as never);
    await expect(createCompany(createInput)).rejects.toBeInstanceOf(CompanyConflictError);
  });

  it("answers an update that races another writer with its intended conflict when the driver error is wrapped", async () => {
    vi.mocked(getDb).mockResolvedValue({ transaction: async () => { throw wrappedDuplicate("companyDomains"); } } as never);
    await expect(updateCompany(1, { addDomains: ["acme.com"] })).rejects.toBeInstanceOf(CompanyConflictError);
  });
});
