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
    const card = screen.getByRole("region", { name: "Open Door" }) ?? screen.getByLabelText("Open Door");
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
    expect(screen.getByRole("button", { name: "Apply for Insider" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start free" })).toBeTruthy();
  });
});
