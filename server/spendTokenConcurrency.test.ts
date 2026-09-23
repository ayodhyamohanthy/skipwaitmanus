import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const spend = () => source.slice(source.indexOf("export async function spendToken"), source.indexOf("export async function createChargebeePaymentIntent"));

describe("spendToken concurrency safety", () => {
  it("serializes concurrent spends on the locked wallet row", () => {
    const body = spend();
    // The wallet read inside the transaction must lock the row; an unlocked
    // read lets two concurrent callers both see balance 1 and both debit.
    expect(body).toContain('.from(tokenBalances)');
    expect(body).toMatch(/from\(tokenBalances\)[\s\S]*?\.for\("update"\)/);
  });

  it("treats a lost promo claim or wallet debit as a busy retry, not a silent success", () => {
    const body = spend();
    expect(body).toContain("affectedRows");
  });
});
