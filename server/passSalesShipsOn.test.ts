// GO-LIVE-1b section 4.5 evidence is in docs/plans/GO-LIVE-1b-pass-activation.md; the owner's go-live word switched passes on (Oct 22).
import { describe, expect, it } from "vitest";
import { PASS_SALES_ENABLED } from "../shared/planCatalog";

describe("pass sales switch as shipped", () => {
  it("ships with pass sales on", () => {
    expect(PASS_SALES_ENABLED).toBe(true);
  });
});
