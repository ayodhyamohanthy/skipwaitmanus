import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const ledgerSource = readFileSync(new URL("./creditLedger.ts", import.meta.url), "utf8");
// spendToken is the single-credit form of spendCredits, defined right after it; both live between these markers.
const spend = () => source.slice(source.indexOf("export async function spendToken"), source.indexOf("export async function createChargebeePaymentIntent"));
const spendTx = () => ledgerSource.slice(ledgerSource.indexOf("export async function spendCreditsTx"), ledgerSource.indexOf("export async function spendAlreadyRecordedTx"));

describe("spendToken concurrency safety", () => {
  it("serializes concurrent spends on the locked wallet row", () => {
    const body = spend();
    // The wallet read inside the transaction must lock the row; an unlocked
    // read lets two concurrent callers both see balance 1 and both debit.
    expect(body).toContain("spendCredits(userId, role, { credits: 1");
    expect(body).toContain('.from(tokenBalances)');
    expect(body).toMatch(/from\(tokenBalances\)[\s\S]*?\.for\("update"\)/);
    expect(body.indexOf('.for("update")')).toBeLessThan(body.indexOf("spendCreditsTx("));
  });

  it("treats a lost promo claim, grant claim or wallet debit as a busy retry, not a silent success", () => {
    const body = spendTx();
    expect(body.match(/affectedRows \?\? 0\) !== 1\) throw new CreditSpendConflictError\(\)/g)).toHaveLength(3);
    // Compare-and-set on the values read under the lock.
    expect(body).toContain("eq(tokenBalances.monthlyCreditsRemaining, wallet.monthlyCreditsRemaining), eq(tokenBalances.balance, wallet.balance)");
  });
});
