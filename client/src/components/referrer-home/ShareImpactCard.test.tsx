// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const flag = vi.hoisted(() => ({ on: true }));
vi.mock("@/lib/shareFlags", () => ({ get SHARE_IMPACT_CARD() { return flag.on; } }));
import { ShareImpactCard } from "./ShareImpactCard";

const ready = {
  state: "ready",
  screenName: "QuietFalcon",
  companyName: "Kestrel Pay",
  companySlug: "kestrel-pay",
  linkPath: "/refer/kestrel-pay/quietfalcon",
  stats: { referredThisMonth: 3, medianFirstReplyHours: 3, acceptRatePct: 64 },
};

function stubFetch(payload: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok, json: async () => payload })));
}
function clipboard() {
  const writeText = vi.fn(async (_text: string) => undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  return writeText;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); flag.on = true; });

describe("Referrer impact card", () => {
  it("flag off (shipped state): nothing renders, no fetch", async () => {
    flag.on = false;
    stubFetch(ready);
    const { container } = render(<ShareImpactCard />);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(container.firstChild).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("insufficient (min-3 gate): renders nothing", async () => {
    stubFetch({ state: "insufficient" });
    const { container } = render(<ShareImpactCard />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(container.firstChild).toBeNull();
  });
  it("ready: screen name, company and aggregates only", async () => {
    stubFetch(ready);
    render(<ShareImpactCard />);
    const card = await screen.findByTestId("share-impact-card");
    expect(within(card).getByText("QuietFalcon · Verified at Kestrel Pay")).toBeTruthy();
    expect(within(card).getByText("3 people")).toBeTruthy();
    expect(within(card).getByText("referred into Kestrel Pay through my link this month.")).toBeTruthy();
    expect(within(card).getByText("3h")).toBeTruthy();
    expect(within(card).getByText("median first reply")).toBeTruthy();
    expect(within(card).getByText("64%")).toBeTruthy();
    expect(within(card).getByText("asks accepted")).toBeTruthy();
    expect(within(card).getByText("skipwait.me/refer/kestrel-pay/quietfalcon")).toBeTruthy();
  });
  it("copied text carries no seeker data and keeps the honest copy", async () => {
    stubFetch(ready);
    const writeText = clipboard();
    render(<ShareImpactCard />);
    await screen.findByTestId("share-impact-card");
    fireEvent.click(screen.getByRole("button", { name: "Copy card as text" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain("QuietFalcon · Verified at Kestrel Pay");
    expect(text).not.toMatch(/seeker|pitch|hired/i);
    fireEvent.click(screen.getByRole("button", { name: "Copy for LinkedIn" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(writeText.mock.calls[1][0] as string).toContain("Ask me for a referral: https://skipwait.me/refer/kestrel-pay/quietfalcon");
  });
  it("fetch failure renders nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    const { container } = render(<ShareImpactCard />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(container.firstChild).toBeNull();
  });
});
