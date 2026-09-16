import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const db=readFileSync(new URL("./db.ts",import.meta.url),"utf8");
const schema=readFileSync(new URL("../drizzle/schema.ts",import.meta.url),"utf8");
describe("per-employee decline routing",()=>{
 it("records a unique employee pass without mutating the shared request",()=>{expect(schema).toContain("referralRequestPasses");const decline=db.slice(db.indexOf('if (input.decision === "declined")'),db.indexOf('const previousPass'));expect(decline).toContain("tx.insert(referralRequestPasses)");expect(decline).not.toContain("update(referralRequests)");expect(decline).toContain('status: "passed"');});
 it("excludes passed employees from inbox and email fanout",()=>{expect(db).toContain("!passed.has(recipient.userId)");expect(db).toContain("isNull(referralRequestPasses.id)");});
 it("retains one-winner acceptance CAS",()=>{expect(db).toContain("isNull(referralRequests.referrerId)");expect(db).toContain('Another verified employee already claimed this request');});
});
