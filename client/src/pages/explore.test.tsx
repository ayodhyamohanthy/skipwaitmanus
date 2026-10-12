// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TARGET_ROLE_URL_ERROR } from "@shared/referralUrl";
import { ASK_PREFILL_KEY } from "@/lib/askPrefill";
import Explore from "./Explore";
import ExploreCompany from "./ExploreCompany";

const { go, routeState, authState } = vi.hoisted(() => ({
  go: vi.fn(),
  routeState: { slug: "wipro" },
  authState: { isSignedIn: true },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: authState.isSignedIn, userId: authState.isSignedIn ? "user-7" : null, getToken: async () => (authState.isSignedIn ? "test-token" : null) }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => [`/explore/${routeState.slug}`, go],
  useRoute: () => [true, { slug: routeState.slug }],
}));

beforeEach(() => {
  routeState.slug = "wipro";
  authState.isSignedIn = true;
  sessionStorage.clear();
  go.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Explore directory", () => {
  it("renders the kit directory from the launch set without any network counts", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<Explore />);
    expect(screen.getByText("5 companies to explore")).toBeTruthy();
    expect(screen.getByText("FIVE OPEN DOORS · MORE TO COME")).toBeTruthy();
    expect(screen.getAllByText("PEOPLE OPEN TO REFERRALS")).toHaveLength(5);
    const doors = screen.getAllByRole("link", { name: /View open door/ });
    expect(doors.map(link => link.getAttribute("href"))).toEqual(["/explore/skipwait", "/explore/wipro", "/explore/go-neutrinos", "/explore/tcs", "/explore/merkle"]);
    expect(screen.queryByText(/open roles?/i)).toBeNull();
    expect(screen.queryByText(/DESIGN PREVIEW|Preview state/i)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("filters by search, function and location, then clears back to every door", () => {
    render(<Explore />);
    fireEvent.change(screen.getByLabelText("Search companies"), { target: { value: "tcs" } });
    expect(screen.getByText("1 company to explore")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Wipro" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("5 companies to explore")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Function"), { target: { value: "Product" } });
    expect(screen.getByText("2 companies to explore")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "India" } });
    expect(screen.getByText("1 company to explore")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Go Neutrinos" })).toBeTruthy();
  });

  it("shows an honest empty state with live recovery links", () => {
    render(<Explore />);
    fireEvent.change(screen.getByLabelText("Search companies"), { target: { value: "zzz-no-such-company" } });
    expect(screen.getByText("No matching doors yet")).toBeTruthy();
    expect(screen.getByText("Try a wider search.")).toBeTruthy();
    expect(screen.queryAllByRole("link", { name: /View open door/ })).toHaveLength(0);
    expect(screen.getByRole("link", { name: /Request a company/ }).getAttribute("href")).toBe("/invite");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("5 companies to explore")).toBeTruthy();
  });

  it("titles the page with the kit head built from the launch set", () => {
    render(<Explore />);
    expect(document.title).toBe("Explore companies · skipwait.me");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("Find people open to referral requests at SkipWait, Wipro, Go Neutrinos, TCS, and Merkle.");
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe("https://skipwait.me/explore");
  });

  it("links the employee band to the live referrer page", () => {
    render(<Explore />);
    expect(screen.getByRole("link", { name: /I can refer/ }).getAttribute("href")).toBe("/referrer");
  });
});

describe("Explore company detail", () => {
  it("renders the app 404 for a company that is not on SkipWait", () => {
    routeState.slug = "no-such-company";
    render(<ExploreCompany />);
    expect(screen.getByRole("heading", { name: "This door doesn't lead anywhere." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Explore companies" }).getAttribute("href")).toBe("/explore");
    expect(screen.queryByRole("button", { name: /Ask for a referral/ })).toBeNull();
  });

  it("renders the kit door with no roles block and no network reads", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ExploreCompany />);
    expect(screen.getByText("PEOPLE OPEN TO REFERRAL REQUESTS", { exact: false }).textContent?.trim()).toBe("PEOPLE OPEN TO REFERRAL REQUESTS");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Wipro.");
    expect(screen.getByText(/Find a role on the company’s own careers site/)).toBeTruthy();
    expect(screen.queryByText(/open roles?|ROLES? LISTED/i)).toBeNull();
    expect(screen.getByRole("link", { name: /All companies/ }).getAttribute("href")).toBe("/explore");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("titles the door with the kit head for that company", () => {
    render(<ExploreCompany />);
    expect(document.title).toBe("Referrals at Wipro · skipwait.me");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("Request a free, private introduction to someone at Wipro.");
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe("https://skipwait.me/explore/wipro");
  });
});

describe("Explore company request dialog", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });

  it("walks the kit steps and hands the draft to the real ask composer without sending", async () => {
    render(<ExploreCompany />);
    fireEvent.click(screen.getByRole("button", { name: /Ask for a referral/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("REQUEST TO WIPRO")).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Role" })).toBeTruthy();
    expect(within(dialog).getByLabelText("Step 1 of 4")).toBeTruthy();
    expect(within(dialog).queryByText(/DESIGN PREVIEW/)).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    expect(within(dialog).getByRole("alert").textContent).toBe(TARGET_ROLE_URL_ERROR);
    expect(within(dialog).getByRole("heading", { name: "Role" })).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText("Job posting link"), { target: { value: " https://careers.wipro.com/jobs/1 " } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    expect(within(dialog).getByRole("heading", { name: "Your fit" })).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Why are you a strong fit?"), { target: { value: "Shipped a design system used by 40 teams." } });
    expect(within(dialog).getByText(`${"Shipped a design system used by 40 teams.".length} / 600`)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    expect(within(dialog).getByRole("heading", { name: "Privacy" })).toBeTruthy();
    expect(within(dialog).getByText("You stay in control.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /Back/ }));
    expect(within(dialog).getByRole("heading", { name: "Your fit" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    expect(within(dialog).getByRole("heading", { name: "Review" })).toBeTruthy();
    expect(within(dialog).getByText("Job link + fit note + privacy choices")).toBeTruthy();
    expect(within(dialog).getByText("Ready")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: /Preview request/ }));
    expect(go).toHaveBeenCalledWith("/ask");
    const saved = JSON.parse(sessionStorage.getItem(ASK_PREFILL_KEY) ?? "null");
    expect(saved).toMatchObject({ companySlug: "wipro", targetRoleUrl: "https://careers.wipro.com/jobs/1", note: "Shipped a design system used by 40 teams." });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("holds Your fit until there is a note, so Review is always complete", async () => {
    render(<ExploreCompany />);
    fireEvent.click(screen.getByRole("button", { name: /Ask for a referral/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Job posting link"), { target: { value: "https://careers.wipro.com/jobs/1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    const fit = within(dialog).getByLabelText("Why are you a strong fit?");
    expect(within(dialog).queryByRole("alert")).toBeNull();
    fireEvent.change(fit, { target: { value: "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    expect(within(dialog).getByRole("heading", { name: "Your fit" })).toBeTruthy();
    expect(within(dialog).getByRole("alert").textContent).toBe("Add a short note on why you’re a strong fit.");
    expect(fit.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(fit, { target: { value: "Led checkout redesign." } });
    expect(within(dialog).queryByRole("alert")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    expect(within(dialog).getByRole("heading", { name: "Review" })).toBeTruthy();
    expect(within(dialog).getByText("Job link + fit note + privacy choices")).toBeTruthy();
    expect(within(dialog).queryByText("Draft")).toBeNull();
    expect(go).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(ASK_PREFILL_KEY)).toBeNull();
  });

  it("starts every new ask empty at Role", async () => {
    render(<ExploreCompany />);
    fireEvent.click(screen.getByRole("button", { name: /Ask for a referral/ }));
    let dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Job posting link"), { target: { value: "https://careers.wipro.com/jobs/1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    fireEvent.change(within(dialog).getByLabelText("Why are you a strong fit?"), { target: { value: "Led checkout redesign." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close request" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /Ask for a referral/ }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Role" })).toBeTruthy();
    expect((within(dialog).getByLabelText("Job posting link") as HTMLInputElement).value).toBe("");
    fireEvent.change(within(dialog).getByLabelText("Job posting link"), { target: { value: "https://careers.wipro.com/jobs/2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    expect((within(dialog).getByLabelText("Why are you a strong fit?") as HTMLTextAreaElement).value).toBe("");
  });
});
