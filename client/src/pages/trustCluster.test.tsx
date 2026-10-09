// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Safety from "./Safety";
import Help from "./Help";
import Landed from "./Landed";
import SignIn from "./SignIn";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/"],
}));
vi.mock("../const", () => ({ startLogin: vi.fn() }));
import { startLogin } from "../const";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Trust cluster", () => {
  it("renders live safety answers with no preview disclaimers", () => {
    render(<Safety />);
    expect(screen.getByText(/Help & safety/)).toBeTruthy();
    expect(screen.getByText(/Only with a referrer who accepted/)).toBeTruthy();
    expect(screen.queryByText(/DESIGN PREVIEW/i)).toBeNull();
    expect(screen.queryByText(/before the platform launches/i)).toBeNull();
    expect(screen.queryByText(/This design preview/i)).toBeNull();
    expect(screen.getByRole("link", { name: /Explore/ }).getAttribute("href")).toBe("/explore");
  });

  it("searches help honestly and links only live policy pages", () => {
    render(<Help />);
    expect(screen.getByText("How can we help")).toBeTruthy();
    expect(screen.queryByText(/Momentum and Land allow more/)).toBeNull();
    expect(screen.queryByText(/preparation tools and more open asks/)).toBeNull();
    fireEvent.change(screen.getByPlaceholderText(/Search: credits/), { target: { value: "expire" } });
    expect(screen.queryByText(/No answers for/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Why did my ask expire?" }));
    // Mirrors shared/referral.ts ASK_TTL_DAYS: unclaimed asks expire after seven days and the credit returns.
    expect(screen.getByText(/claimed it within seven days/).textContent).toContain("reserved credit returned");
    expect(screen.queryByText(/usually within 2 days/)).toBeNull();
    fireEvent.change(screen.getByPlaceholderText(/Search: credits/), { target: { value: "zzz-no-such-topic" } });
    expect(screen.getByText(/No answers for/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Search: credits/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("tab", { name: /Safety/ }));
    expect(screen.getAllByRole("button", { expanded: false }).map(button => button.textContent)).toEqual(["Someone asked me for money.", "How do I block someone?"]);
    const policies = screen.getByText("Rules & policies").closest("section") as HTMLElement;
    expect(policies.innerHTML).toContain("/terms");
    expect(policies.innerHTML).toContain("/safety");
    expect(policies.innerHTML).toContain("/guidelines");
    expect(policies.innerHTML).toContain("/privacy");
    expect(screen.getByRole("link", { name: "Contact support" }).getAttribute("href")).toBe("/support");
  });

  it("walks the landed journey with a copyable thanks and no fabricated outcome", () => {
    render(<Landed />);
    expect(screen.getByText("You did it.")).toBeTruthy();
    expect(screen.getByText(/Illustrative outcome, not a real hire/)).toBeTruthy();
    expect(screen.queryByText(/Product Designer at Wipro/)).toBeNull();
    expect(screen.queryByText(/Rahul/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Thank your referrer/ }));
    expect(screen.getByText("Say thanks.")).toBeTruthy();
    expect(screen.queryByText(/thank-you wall/)).toBeNull();
  });

  it("offers intent choice on the split design, never a password form", () => {
    render(<SignIn />);
    expect(screen.getByText(/Welcome to SkipWait/)).toBeTruthy();
    expect(screen.queryByLabelText(/Password/)).toBeNull();
    expect(screen.queryByText(/Forgot password/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Give a referral/ }));
    expect(screen.getByText(/Choose who you help/)).toBeTruthy();
  });
});
