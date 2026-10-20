import { describe, expect, it } from "vitest";
import { PASS_SALES_ENABLED, SINGLE_CREDIT_RETIRED_CODE, SINGLE_CREDIT_RETIRED_ERROR, SINGLE_CREDIT_RETIRES_WITH_PACKS, catalogPackItemPriceId, singleCreditRetired } from "../shared/planCatalog";

// D-084 / GO-LIVE-1: the two computed money switches the server and /plans share.
describe("GO-LIVE-1 shared switches", () => {
  it("ships with passes off until a paid pass can always be activated (GO-LIVE-1b)", () => {
    expect(PASS_SALES_ENABLED).toBe(false);
  });

  it("ships with the single-credit retirement on and a plain refusal that says nothing was charged", () => {
    expect(SINGLE_CREDIT_RETIRES_WITH_PACKS).toBe(true);
    expect(SINGLE_CREDIT_RETIRED_CODE).toBe("single_credit_retired");
    expect(SINGLE_CREDIT_RETIRED_ERROR).toBe("Single credits are replaced by credit packs. Nothing has been charged.");
  });

  it("retires the single credit in a currency only once a pack sold in that currency is live", () => {
    const live = (ids: string[]) => (id: string) => ids.includes(id);
    expect(singleCreditRetired("INR", live([]))).toBe(false);
    expect(singleCreditRetired("INR", live([catalogPackItemPriceId("pack_2", "INR")]))).toBe(true);
    expect(singleCreditRetired("INR", live([catalogPackItemPriceId("pack_150", "INR")]))).toBe(true);
    // pack_5 is sold in USD only, so a live USD pack never retires the INR credit.
    expect(singleCreditRetired("INR", live([catalogPackItemPriceId("pack_5", "USD"), catalogPackItemPriceId("pack_25", "USD")]))).toBe(false);
    expect(singleCreditRetired("USD", live([catalogPackItemPriceId("pack_5", "USD")]))).toBe(true);
    expect(singleCreditRetired("USD", live([catalogPackItemPriceId("pack_2", "INR")]))).toBe(false);
  });

  it("never asks about an item price the currency does not sell", () => {
    const asked: string[] = [];
    singleCreditRetired("USD", id => { asked.push(id); return false; });
    expect(asked).not.toContain(catalogPackItemPriceId("pack_2", "USD"));
    expect(asked).toContain(catalogPackItemPriceId("pack_5", "USD"));
  });
});
