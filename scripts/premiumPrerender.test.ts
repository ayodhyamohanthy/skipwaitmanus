import { afterEach, describe, expect, it, vi } from "vitest";
import { publicSnapshots } from "./prerender-public-pages";
import { publicRoute } from "../shared/publicRoutes";
import type * as PlanCatalog from "../shared/planCatalog";

const flags = vi.hoisted(() => ({ sales: false }));
vi.mock("../shared/planCatalog", async original => ({ ...(await original<typeof PlanCatalog>()), get CREDIT_PACKS_ON_SALE() { return flags.sales; } }));

afterEach(() => { flags.sales = false; });

describe("premium goal release before JavaScript", () => {
  it.each([false, true])("keeps the paused-sale truth when the legacy sale flag is %s", sales => {
    flags.sales = sales;
    const snapshot = publicSnapshots().find(page => page.route === "/premium");
    expect(snapshot?.markup).toContain("<h1>Get more referral requests.</h1>");
    expect(snapshot?.markup).toContain("Extra referral requests are paused.");
    expect(snapshot?.markup).toContain('href="/support"');
    expect(snapshot?.markup).toContain('href="/request"');
    expect(snapshot?.markup).not.toMatch(/\bcredits?\b|\basks\b|Buy|Pay \$|Pay ₹|referral requests left|plans#packs|bonus/i);
  });

  it("describes the currently paused route in search and share metadata", () => {
    const route = publicRoute("/premium");
    expect(route?.title).toBe("Get more referral requests");
    expect(route?.description).toBe("Extra referral requests are paused. Existing balances still work. Get help with a recent payment.");
    const snapshot = publicSnapshots().find(page => page.route === "/premium");
    expect(snapshot?.title).toBe(route?.title);
    expect(snapshot?.description).toBe(route?.description);
  });
});
