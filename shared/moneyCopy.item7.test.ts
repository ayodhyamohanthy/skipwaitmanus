import { describe, expect, it } from "vitest";
import { addCreditPhrase, creditReservedPhrase, creditUsedPhrase } from "./moneyCopy";
import { coverageHeldNotice } from "../server/coverageDelivery";

describe("D-132 item 7 cost phrases (flag off keeps today's copy)", () => {
  it("flat 1 credit while the level model is off", () => {
    expect(addCreditPhrase(false)).toBe("Add a credit");
    expect(creditUsedPhrase(false)).toBe("1 credit is used");
    expect(creditReservedPhrase(false)).toBe("1 credit reserved");
  });
  it("no fixed '1 credit' once the level model is on", () => {
    for (const s of [addCreditPhrase(true), creditUsedPhrase(true), creditReservedPhrase(true)]) expect(s).not.toMatch(/\b1 credit|a credit/i);
  });
  it("held notice is unchanged with the flag off", () => {
    const n = coverageHeldNotice("acme.com");
    expect(n.title).toBe("Add a credit to send your ask");
    expect(n.body).toBe("A verified employee at acme.com can now see asks. Add a credit to send yours.");
  });
});
