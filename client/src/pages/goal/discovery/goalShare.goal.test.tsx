// @vitest-environment jsdom
// D-048-p3-discovery, owner acceptance rule (Oct 30): /wall and /jobs render no
// kit or legacy UI. The share block is goal-native (GoalShareActions) while its
// behaviour stays identical to the kit OneTapShareActions it replaces: the same
// share targets, hrefs, copy and the same "More" path (navigator.share, else
// copy). The kit component is rendered here only as the behaviour oracle.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OneTapShareActions } from "@/components/OneTapShareActions";
import { GoalShareActions, GoalZeroActivityShare, shareTargets } from "./GoalShareActions";
import GoalWall from "./GoalWall";
import GoalJobs from "./GoalJobs";

const { auth, go, toast, openSignIn } = vi.hoisted(() => ({ auth: { isSignedIn: false }, go: vi.fn(), toast: vi.fn(), openSignIn: vi.fn() }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: auth.isSignedIn, openSignIn }),
  // The real SignInButton wraps its child in a <button> unless the child is a native button.
  SignInButton: ({ children }: { children: React.ReactNode }) => <button type="button" data-kit-sign-in onClick={() => openSignIn()}>{children}</button>,
}));
vi.mock("wouter", () => ({ Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>, useLocation: () => ["/", go] }));
vi.mock("sonner", () => ({ toast }));

type Json = Record<string, unknown>;
const ok = (body: Json) => ({ ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => body, text: async () => JSON.stringify(body) });
const fail = (body: Json, status = 500) => ({ ok: false, status, headers: new Headers({ "content-type": "application/json" }), json: async () => body, text: async () => JSON.stringify(body) });
const opening = (over: Json = {}) => ({ id: 4, companyDomain: "synthetic.example", kind: "hiring_now", roleTitle: "Product Designer", targetRoleUrl: "https://careers.synthetic.example/jobs/design", location: "Remote", walkInAt: null, walkInEndsAt: null, createdAt: "2026-10-01T00:00:00Z", poster: { kind: "anonymous" }, ...over });

function stubWall(opportunities: Json[]) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/partners") return ok({ modules: [] });
    if (url === "/api/companies") return ok({ companies: [] });
    return ok({ opportunities });
  }));
}

const PROPS = { title: "Product Designer at synthetic.example", message: "A verified employee shared a hiring signal for Product Designer at synthetic.example. See if this opening is relevant to you:", link: "https://skipwait.me/wall?opening=4" };
const LABELS = ["Share on WhatsApp", "Share on Telegram", "Share by email", "Share on LinkedIn", "Share on X"];
const KIT_CLASS = /#[0-9a-f]{3,6}|rounded-lg|text-\[11px\]|font-bold/i;

function hrefsOf(root: HTMLElement) {
  return Object.fromEntries(LABELS.map(label => {
    const link = within(root).getByRole("link", { name: label });
    return [label, { href: link.getAttribute("href"), target: link.getAttribute("target"), rel: link.getAttribute("rel") }];
  }));
}

function kitClassesIn(root: Element) {
  return [root, ...Array.from(root.querySelectorAll("*"))].map(el => String(el.getAttribute("class") ?? "")).filter(cls => KIT_CLASS.test(cls));
}

beforeEach(() => { localStorage.clear(); auth.isSignedIn = false; window.history.replaceState(null, "", "/"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); go.mockClear(); toast.mockClear(); openSignIn.mockClear(); });

describe("GoalShareActions keeps the kit share behaviour", () => {
  it("offers the same five share links, hrefs, targets and rel as the kit component", () => {
    const kit = render(<OneTapShareActions {...PROPS} />);
    const expected = hrefsOf(kit.container);
    kit.unmount();
    const { container } = render(<GoalShareActions {...PROPS} />);
    expect(hrefsOf(container)).toEqual(expected);
    expect(screen.getByRole("button", { name: "More sharing options" })).toBeTruthy();
  });

  it("builds the targets from one pure helper", () => {
    const targets = shareTargets(PROPS);
    const text = encodeURIComponent(`${PROPS.message}\n\n${PROPS.link}`);
    expect(targets.map(t => t.label)).toEqual(LABELS);
    expect(targets[0].href).toBe(`https://wa.me/?text=${text}`);
    expect(targets[1].href).toBe(`https://t.me/share/url?url=${encodeURIComponent(PROPS.link)}&text=${text}`);
    expect(targets[2].href).toBe(`mailto:?subject=${encodeURIComponent(PROPS.title)}&body=${text}`);
    expect(targets[3].href).toBe(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(PROPS.link)}`);
    expect(targets[4].href).toBe(`https://x.com/intent/post?text=${text}`);
  });

  it("More uses the native share sheet with the same payload", async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, share, clipboard: { writeText: vi.fn() } });
    render(<GoalShareActions {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "More sharing options" }));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: PROPS.title, text: PROPS.message, url: PROPS.link }));
  });

  it("More copies the same text without a share sheet and says so in the goal status line, not a kit toast", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, share: undefined, clipboard: { writeText } });
    render(<GoalShareActions {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "More sharing options" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${PROPS.message}\n\n${PROPS.link}`));
    expect((await screen.findByRole("status")).textContent).toBe("Opening link copied.");
    expect(toast).not.toHaveBeenCalled();
  });

  it("a cancelled share sheet shows nothing", async () => {
    vi.stubGlobal("navigator", { ...navigator, share: vi.fn(async () => { throw new Error("AbortError"); }), clipboard: { writeText: vi.fn() } });
    render(<GoalShareActions {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "More sharing options" }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.queryByRole("status")?.textContent ?? "").toBe("");
  });

  it("is goal-native: goal tokens only, no kit hexes or kit type", () => {
    const { container } = render(<GoalShareActions {...PROPS} />);
    expect(container.querySelector("[data-goal-share]")).toBeTruthy();
    expect(kitClassesIn(container)).toEqual([]);
  });

  it("the zero-activity share keeps the kit card's link, title and message for a job seeker", () => {
    const { container } = render(<GoalZeroActivityShare />);
    const section = container.querySelector('[data-skipwait-zero-action="job_seeker"]') as HTMLElement;
    expect(section).toBeTruthy();
    expect(section.textContent).toContain("Share this useful next step");
    const text = encodeURIComponent(`A role link can become a private referral request. See if this is useful for you:\n\n${window.location.origin}/start`);
    expect(within(section).getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href")).toBe(`https://wa.me/?text=${text}`);
    expect(within(section).getByRole("link", { name: "Share by email" }).getAttribute("href")).toContain(`subject=${encodeURIComponent("Private referral requests")}`);
    expect(kitClassesIn(section)).toEqual([]);
  });
});

describe("goal /wall renders the goal share, never the kit one", () => {
  it("shares the selected opening through GoalShareActions with the kit's link and message", async () => {
    stubWall([opening()]);
    const { container } = render(<GoalWall />);
    await screen.findByRole("heading", { level: 3, name: "Product Designer" });
    const share = container.querySelector("[data-goal-share]") as HTMLElement;
    expect(share).toBeTruthy();
    const text = encodeURIComponent(`${PROPS.message}\n\n${window.location.origin}/wall?opening=4`);
    expect(within(share).getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href")).toBe(`https://wa.me/?text=${text}`);
    expect(kitClassesIn(container)).toEqual([]);
  });

  it("an empty wall keeps the kit page's zero-activity share, goal-native", async () => {
    stubWall([]);
    const { container } = render(<GoalWall />);
    await screen.findByText("No openings shared yet.");
    expect(container.querySelector('[data-skipwait-zero-action="job_seeker"] [data-goal-share]')).toBeTruthy();
    expect(kitClassesIn(container)).toEqual([]);
  });
});

describe("goal /jobs renders no kit UI", () => {
  const jobs = [{ id: 11, title: "Senior Product Designer", company: "Synthetic Co", location: "Bengaluru", seniority: "Senior", workMode: "Hybrid", targetRoleUrl: "https://careers.synthetic.example/jobs/11" }];

  it("signed out, Sign in is one goal button (no button nested in a button) that opens sign-in", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ jobs })));
    const { container } = render(<GoalJobs />);
    await screen.findByRole("heading", { level: 3, name: "Senior Product Designer" });
    expect(container.querySelector("button button")).toBeNull();
    expect(container.querySelector("[data-kit-sign-in]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(openSignIn).toHaveBeenCalled();
  });

  it("a failed save says so in the goal status line, not a kit toast", async () => {
    auth.isSignedIn = true;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/saved-roles/")) return fail({ error: "We could not update your saved roles" });
      if (url === "/api/saved-roles") return ok({ saved: [] });
      return ok({ jobs });
    }));
    render(<GoalJobs />);
    await screen.findByRole("heading", { level: 3, name: "Senior Product Designer" });
    fireEvent.click(screen.getByRole("button", { name: "Save Senior Product Designer" }));
    expect((await screen.findByRole("alert")).textContent).toContain("We could not update your saved roles");
    expect(toast).not.toHaveBeenCalled();
  });
});
