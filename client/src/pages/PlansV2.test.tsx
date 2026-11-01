// @vitest-environment jsdom
// Plans v2 "Choose your reach." (D-132): pins the frozen model's display
// contract - three plan cards, Open Door defaults to its 3 free credits,
// This month = plan fee + picked rung, compare table from config.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PlansV2 from "./PlansV2";

afterEach(cleanup);

describe("PlansV2 (D-132, flag OFF)", () => {
  it("opens with 'Choose your reach.' and the India price note", () => {
    render(<PlansV2 book="INR" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Choose your reach.");
    expect(screen.getByText(/Prices for India/)).toBeTruthy();
  });

  it("Open Door defaults to the 3 free credits: This month is Rs0, no paid default", () => {
    render(<PlansV2 book="INR" />);
    const card = screen.getByRole("region", { name: "Entry level Referrers" });
    expect(within(card as HTMLElement).getByTestId("this-month-open_door").textContent).toBe("₹0");
    expect(within(card as HTMLElement).getByText(/3 free credits every month/)).toBeTruthy();
  });

  it("Fast Track defaults to 25 credits: This month Rs1,624 = Rs499 fee + Rs1,125", () => {
    render(<PlansV2 book="INR" />);
    expect(screen.getByTestId("this-month-fast_track").textContent).toBe("₹1,624");
    expect(screen.getByText(/save ₹100 \(8%\)/)).toBeTruthy();
  });

  it("Insider defaults to 50 credits: This month Rs3,449 = Rs1,299 fee + Rs2,150 (save Rs300, 12%)", () => {
    render(<PlansV2 book="INR" />);
    expect(screen.getByTestId("this-month-insider").textContent).toBe("₹3,449");
    expect(screen.getByText(/save ₹300 \(12%\)/)).toBeTruthy();
  });

  it("picking another rung recomputes This month (Fast Track 10cr -> Rs969)", () => {
    render(<PlansV2 book="INR" />);
    const card = screen.getByTestId("this-month-fast_track").closest("section") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: /Credits per month for fast_track/i }));
    fireEvent.click(within(card).getByRole("option", { name: /10 credits/ }));
    expect(screen.getByTestId("this-month-fast_track").textContent).toBe("₹969");
  });

  it("USD book: Fast Track + 25cr = $32.99", () => {
    render(<PlansV2 book="USD" />);
    expect(screen.getByTestId("this-month-fast_track").textContent).toBe("$32.99");
  });

  it("compare table matches config: ask coach Per use / 10 / 30, open asks 3 / 4 / 6", () => {
    render(<PlansV2 book="INR" />);
    const region = screen.getByLabelText("Compare plans");
    const row = within(region).getByRole("row", { name: /Ask coach/ });
    const cells = within(row).getAllByRole("cell").map(c => c.textContent);
    expect(cells).toEqual(["Per use", "10", "30"]);
    const asks = within(region).getByRole("row", { name: /Open asks at once/ });
    expect(within(asks).getAllByRole("cell").map(c => c.textContent)).toEqual(["3", "4", "6"]);
  });

  it("exactly one black commit (Fast Track); Insider applies, Open Door starts free", () => {
    render(<PlansV2 book="INR" />);
    expect(document.querySelectorAll('[data-g-primary="true"]').length).toBe(1);
    expect(screen.getByRole("button", { name: "Apply for Senior level Referrers" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start free" })).toBeTruthy();
  });

  it("plan names are Entry / Mid / Senior level Referrers (D-152) with the D-132 numbers unchanged", () => {
    render(<PlansV2 book="INR" />);
    for (const n of ["Entry level Referrers", "Mid level Referrers", "Senior level Referrers"]) expect(screen.getByRole("region", { name: n })).toBeTruthy();
    expect(screen.queryByText(/Open Door|Fast Track|Insider/)).toBeNull();
    expect(screen.getByText("Plan names say how far you can reach, not how senior you are.")).toBeTruthy();
  });

  it("reach row (D-148): signed out shows no level guess and the profile line", () => {
    render(<PlansV2 book="INR" />);
    expect(screen.getByTestId("reach-open_door").textContent).toContain("Your own level");
    expect(screen.getByTestId("reach-fast_track").textContent).toContain("Up to 2 levels above yours");
    expect(screen.getByTestId("reach-insider").textContent).toContain("Up to 4 levels above yours");
    expect(screen.getByText("Sign in and set your level to see exactly who each plan reaches.")).toBeTruthy()
    expect(document.querySelector('a[href="/profile"]')).toBeNull();
    expect(screen.getByText("Reach sets who you can ask. It never changes your place in a queue.")).toBeTruthy();
    expect(screen.queryByText(/1-2 levels up/)).toBeNull();
    expect(screen.getByText("Reach up to 2 levels above your own")).toBeTruthy();
    expect(screen.getByText("Reach up to 4 levels above your own")).toBeTruthy();
  });

  it("reach row: L2 seeker sees the designer examples", () => {
    render(<PlansV2 book="USD" seekerLevel={2} />);
    expect(screen.getByTestId("reach-open_door").textContent).toContain("Your own level: Entry-level · L2");
    expect(screen.getByTestId("reach-fast_track").textContent).toContain("Entry-level up to Mid-level · L2 to L4");
    expect(screen.getByTestId("reach-insider").textContent).toContain("Entry-level up to Senior II · L2 to L6");
  });

  it("signed-in level picker lists L1-L10, shows the chosen level, and reports the pick", () => {
    const picks: (number | null)[] = [];
    render(<PlansV2 book="INR" seekerLevel={4} onPickLevel={l => picks.push(l)} />);
    const select = screen.getByLabelText("Your level") as HTMLSelectElement;
    expect(select.options.length).toBe(11);
    expect(screen.getByTestId("reach-fast_track").textContent).toContain("Mid-level up to Senior II · L4 to L6");
    expect(screen.getByTestId("reach-insider").textContent).toContain("Mid-level up to Principal · L4 to L8");
    fireEvent.change(select, { target: { value: "7" } });
    fireEvent.change(select, { target: { value: "" } });
    expect(picks).toEqual([7, null]);
  });

  it("signed in with no level: hint sits at the picker, no profile link", () => {
    render(<PlansV2 book="INR" onPickLevel={() => {}} />);
    expect(screen.getByText("Set your level here to see exactly who each plan reaches.")).toBeTruthy();
    expect(screen.queryByText(/Sign in and set your level/)).toBeNull();
    expect(document.querySelector('a[href="/profile"]')).toBeNull();
  });
});
