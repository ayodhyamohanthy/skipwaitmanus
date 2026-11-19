import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The money check joins referralRequests.id (an int) to tokenTransactions.referenceId (a string). Casting only
// the int side picks the connection collation and fails with "Illegal mix of collations" on any database whose
// referenceId column uses another collation (the QA schema is utf8mb4_0900_ai_ci). Both sides must be cast.
describe("money check orphan-debit join collation", () => {
  const source = readFileSync("server/db.ts", "utf8");
  const line = source.split("\n").find(l => l.includes("const orphanDebits")) ?? "";
  it("casts both join sides to the connection collation", () => {
    expect(line).toContain("CAST(${referralRequests.id} AS CHAR)");
    expect(line).toContain("CAST(${tokenTransactions.referenceId} AS CHAR)");
    expect(line).not.toMatch(/AS CHAR\)`,tokenTransactions\.referenceId\)/);
  });
});
