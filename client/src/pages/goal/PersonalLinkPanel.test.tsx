// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalLinkPanel } from "./PersonalLinkPanel";

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, userId: "u1", getToken: async () => null }) }));

const LINK = { linkCode: "abcdef0123456789", vanityAlias: "ref-priya", companyDomain: "example.com", isActive: true, url: "https://skipwait.me/fast/abcdef0123456789", vanityUrl: "https://skipwait.me/refer/example/ref-priya", suggestedBioCopy: "Private referral requests at example.com via SkipWait." };
let getStatus = 200;
let pauseStatus = 200;
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (url === "/api/referrer-fast-track/me") return getStatus === 200 ? json({ link: LINK }) : json({ error: "down" }, getStatus);
  if (url === "/api/referrer-fast-track/me/deactivate" && init?.method === "POST") return pauseStatus === 200 ? json({ deactivated: true }) : json({ error: "nope" }, pauseStatus);
  return json({}, 404);
});

beforeEach(() => {
  getStatus = 200;
  pauseStatus = 200;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderPanel = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PersonalLinkPanel /></QueryClientProvider>);
const pauseCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/deactivate")).length;

describe("PersonalLinkPanel", () => {
  it("copies the link alone, then the bio line with the link, and opens LinkedIn", async () => {
    const user = userEvent.setup();
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { written.push(text); } } });
    const open = vi.fn();
    vi.stubGlobal("open", open);
    renderPanel();
    expect(await screen.findByText("skipwait.me/refer/example/ref-priya")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    await user.click(screen.getByRole("button", { name: "Copy for LinkedIn bio" }));
    expect(written).toEqual([LINK.vanityUrl, `${LINK.suggestedBioCopy}\n${LINK.vanityUrl}`]);
    expect(open).toHaveBeenCalledWith("https://www.linkedin.com/in/me/", "_blank", "noopener,noreferrer");
    expect(screen.getByRole("status").textContent).toBe("Bio line copied. Paste it in your LinkedIn bio.");
  });

  it("pauses only after confirmation, then offers a fresh link", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Pause link" }));
    const dialog = await screen.findByRole("dialog", { name: "Pause your personal link?" });
    expect(pauseCalls()).toBe(0);
    await user.click(within(dialog).getByRole("button", { name: "Keep it" }));
    expect(pauseCalls()).toBe(0);
    await user.click(screen.getByRole("button", { name: "Pause link" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Pause link" }));
    await waitFor(() => expect(screen.getByTestId("goal-personal-link").getAttribute("data-state")).toBe("paused"));
    expect(pauseCalls()).toBe(1);
    await user.click(screen.getByRole("button", { name: "Create a new link" }));
    await waitFor(() => expect(screen.getByTestId("goal-personal-link").getAttribute("data-state")).toBe("active"));
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/referrer-fast-track/me")).toHaveLength(2);
  });

  it("keeps the link live when pausing fails", async () => {
    const user = userEvent.setup();
    pauseStatus = 500;
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Pause link" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Pause link" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Your link is unchanged.");
    expect(screen.getByTestId("goal-personal-link").getAttribute("data-state")).toBe("active");
  });

  it("shows an inline error with a retry when the link cannot load", async () => {
    const user = userEvent.setup();
    getStatus = 503;
    renderPanel();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Personal links are unavailable right now");
    getStatus = 200;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("skipwait.me/refer/example/ref-priya")).toBeTruthy();
  });
});
