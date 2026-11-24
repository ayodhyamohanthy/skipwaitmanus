// @vitest-environment jsdom
// D-099 slice A (D-374): the report form's honest states. Written before the component.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BONUS_REPORT_LIMIT_MESSAGE } from "@shared/referralBonus";
import { ReportBonusFigure } from "./ReportBonusFigure";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ReportBonusFigure", () => {
  it("offers the sign-in link with a return path when signed out", () => {
    render(<ReportBonusFigure slug="wipro" companyName="Wipro" signedIn={false} />);
    const link = screen.getByRole("link", { name: /sign in to report a wrong figure/i });
    expect(link.getAttribute("href")).toBe("/sign-in?returnTo=%2Fexplore%2Fwipro");
  });

  it("offers exactly the four reasons and never new_source", () => {
    render(<ReportBonusFigure slug="wipro" companyName="Wipro" signedIn />);
    fireEvent.click(screen.getByRole("button", { name: /report a wrong figure/i }));
    const options = Array.from(document.querySelectorAll("option")).map(option => option.getAttribute("value"));
    expect(options).toEqual(["figure_changed", "source_gone", "not_this_company", "other"]);
  });

  it("posts the report and shows the thank-you state", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ ok: true }) }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(<ReportBonusFigure slug="wipro" companyName="Wipro" signedIn />);
    fireEvent.click(screen.getByRole("button", { name: /report a wrong figure/i }));
    fireEvent.click(screen.getByRole("button", { name: /send report/i }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Thank you"));
    expect(fetchMock).toHaveBeenCalledWith("/api/company-bonuses/wipro/reports", expect.objectContaining({ method: "POST" }));
  });

  it("shows the server's neutral limit message on 429", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: BONUS_REPORT_LIMIT_MESSAGE }) }) as Response));
    render(<ReportBonusFigure slug="wipro" companyName="Wipro" signedIn />);
    fireEvent.click(screen.getByRole("button", { name: /report a wrong figure/i }));
    fireEvent.click(screen.getByRole("button", { name: /send report/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(BONUS_REPORT_LIMIT_MESSAGE));
  });

  it("shows a plain retry message on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    render(<ReportBonusFigure slug="wipro" companyName="Wipro" signedIn />);
    fireEvent.click(screen.getByRole("button", { name: /report a wrong figure/i }));
    fireEvent.click(screen.getByRole("button", { name: /send report/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("could not send"));
  });
});
