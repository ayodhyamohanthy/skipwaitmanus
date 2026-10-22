// @vitest-environment jsdom
// Review round 2 (D-067, D-042): CREDIT_PACKS_ON_SALE is the switch that takes credit packs off
// sale without deleting them. With it off, no seeker surface may still offer "Add credits" and
// lead to the "Credit packs are paused." screen. creditPacksOnSale.test.tsx pins the shipped (on) state.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CREDIT_PACKS_ON_SALE } from "@shared/planCatalog";
import { CurrentPlanPanel } from "@/components/plans/BillingPanels";
import { UpgradeMoments, upgradeMoments } from "@/components/plans/UpgradeMoments";

vi.mock("@shared/planCatalog", async importOriginal => ({ ...(await importOriginal<typeof import("@shared/planCatalog")>()), CREDIT_PACKS_ON_SALE: false }));
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));

// A Free account that spent its month's credits: the out-of-credits moment applies.
const spentFree = { plan: "free", subscriptionStatus: null, subscriptionCurrentTermEnd: null, totalAvailable: 0, slots: { plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: null }, ledger: { balance: 0, cycle: { used: 3 }, planCreditsExpiringSoon: null } } as never;

afterEach(() => cleanup());

describe("credit packs off sale", () => {
  it("runs with the flag mocked off", () => { expect(CREDIT_PACKS_ON_SALE).toBe(false); });

  it("the out-of-credits moment offers no purchase: no Add credits link, dismiss only", () => {
    const moments = upgradeMoments(spentFree, new Date(), "/premium?role=job_seeker");
    const credits = moments.find(moment => moment.id === "credits");
    expect(credits).toBeDefined();
    expect(credits?.cta).toBeNull();
    expect(credits?.alt).toBe("dismiss");
    expect(credits?.copy).not.toMatch(/purchased|never expire|add credits/i);
    render(<UpgradeMoments moments={moments} />);
    expect(screen.getByText("You're out of credits")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Add credits" })).toBeNull();
    expect(document.querySelector('a[href^="/premium"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
  });

  it("the Free billing panel shows no Add credits button", () => {
    render(<CurrentPlanPanel summary={spentFree} onCancel={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Free" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Add credits" })).toBeNull();
    expect(document.querySelector('a[href^="/premium"]')).toBeNull();
  });
});
