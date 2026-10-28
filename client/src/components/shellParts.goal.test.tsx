// @vitest-environment jsdom
/**
 * D-048-F-shell-parts (docs/plans/GOAL_UI_COVERAGE.md section 6.2): the four
 * shell parts - AccountMenu, NotificationBell, BetaNotice, CookieConsent - move
 * onto the goal system, and their behaviour does not move at all.
 *
 * Each part is pinned twice:
 *  - source: no colour literal and no kit/shadcn utility (DESIGN.md: "Don't use
 *    Kit v4 or shadcn tokens in goal UI"); group `source rules` below;
 *  - DOM: the rendered affordance carries goal tokens and still does exactly
 *    what it did before - the same menu entries and destinations, the bell's
 *    count, its one-shot load and its routing, the beta words and link, the
 *    cookie choices and applyAnalyticsConsent.
 *
 * The cookie banner is global: it floats over the landing and every page that
 * mounts it, and each of those pages owns the one black commit on its screen
 * (DESIGN.md §1: "Exactly one solid black element per screen, and it is the
 * commit action"; GoalLanding.test.tsx counts `[data-g-primary="true"]`). So
 * neither choice is black. "Essential only" and "Accept all" both wear
 * GoalButton's ink-outline recipe with the large phone height, class for class,
 * so refusing looks exactly as easy as accepting. The pin renders GoalButton
 * itself and compares, so the banner cannot drift from the primitive while
 * CookieConsent.tsx may not import components/goal (goalBoundary.test.ts,
 * owned by another row).
 *
 * The equal-outline treatment is also the documented independent designer
 * finding on #767 (owner comment 2026-10-28T12:10:17Z): independent visual
 * evidence at 5a3b193c showed both choices equal ink-outline and only the
 * page's own company action black, resolving the signed-out consent contrast
 * finding. It is recorded in docs/plans/GOAL_UI_COVERAGE.md §6.2.
 *
 * BetaNotice keeps its `kit` tone: /sign-in has not moved yet (D-048-p3-signin)
 * and DESIGN.md forbids goal tokens on an unmoved surface, so only the `goal`
 * tone is pinned here.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoalButton } from "@/components/goal/GoalButton";
import { AccountMenu } from "./AccountMenu";
import { BetaBadge, BetaNoticeLine } from "./BetaNotice";
import CookieConsent, { applyAnalyticsConsent, readCookieConsent } from "./CookieConsent";
import { NotificationBell } from "./NotificationBell";

const COMPONENTS_DIR = path.join(process.cwd(), "client", "src", "components");
const sourceOf = (file: string) => fs.readFileSync(path.join(COMPONENTS_DIR, file), "utf8");

/** A colour literal: a hex in a class or an inline style, or a colour function. */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab)\(/;
/** Kit v4 / shadcn utilities, plus Tailwind's default radius, shadow and entrance-animation scales. */
const KIT_UTILITY =
  /(?:bg|text|border|ring|outline|fill|stroke|divide|placeholder|caret|decoration|accent)-(?:primary|primary-foreground|secondary|muted|accent|destructive|border|input|ring|background|foreground|card|popover|ink|paper|signal)\b|rounded-(?:sm|md|lg|xl|2xl|3xl|4xl)\b|shadow-(?:sm|md|lg|xl|2xl|inner)\b|\bfont-mono\b|brand-button|\banimate-(?:in|out)\b/;
const GOAL_TOKEN = /\bg-[a-z]/;
/** R2/R3 in scripts/designTokenAuditCore.mjs: these hues are audited away outside components/goal. */
const RESERVED_HUE = /\bg-(?:trust|emerald|amber|crimson)\b/;


const authState = vi.hoisted(() => ({ signedIn: true, getToken: async () => "tok" }));
const signOut = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: authState.signedIn, userId: "12", getToken: authState.getToken, signOut }),
  useUser: () => ({ user: { imageUrl: "https://images.example.test/avery.png", fullName: "Avery Doe", primaryEmailAddress: { emailAddress: "avery@example.com" } } }),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => [window.location.pathname, (to: string) => window.history.pushState({}, "", to)],
}));
const consentV2 = vi.hoisted(() => vi.fn());
const clarityActive = vi.hoisted(() => ({ value: false }));
vi.mock("@microsoft/clarity", () => ({ default: { consentV2 } }));
vi.mock("@/lib/clarity", () => ({ isClarityActive: () => clarityActive.value }));

// The bell reads /api/notifications; the account menu reads the server's referrer verdict.
const bellState = vi.hoisted(() => ({ unread: 0, calls: 0 }));
const ACCESS_PATH = "/api/company-referrals/access";
const VERIFIED = { verifiedCompanyAccess: true, workEmailDomain: "acme.com", companyName: "Acme", companyInitials: "A" };
const UNVERIFIED = { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null };
let accessReply: Record<string, unknown> = UNVERIFIED;
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const fetchMock = vi.fn(async (url: string) => {
  const target = String(url);
  if (target === "/api/notifications") {
    bellState.calls += 1;
    // Every second update is already read: the bell counts only the null readAt rows.
    return json({ notifications: Array.from({ length: bellState.unread }, (_, index) => ({ id: index + 1, readAt: index % 2 ? "2026-10-01T00:00:00.000Z" : null })) });
  }
  if (target === ACCESS_PATH) return json(accessReply);
  return json({});
});

const MENU_ITEMS: ReadonlyArray<readonly [string, string]> = [
  ["Notifications", "/notifications"],
  ["Direct messages", "/messages"],
  ["My requests", "/requests"],
  ["Internal openings", "/wall"],
  ["Employer dashboard", "/employer"],
  ["Share skipwait.me", "/share"],
  ["Settings", "/settings"],
];
const REFERRER_ITEMS: ReadonlyArray<readonly [string, string]> = [
  ["My Company Inbox", "/inbox"],
  ["My impact", "/referrer/impact"],
];

function renderMenu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  return render(<QueryClientProvider client={client}><AccountMenu /></QueryClientProvider>);
}
function openMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: "Account menu" }), { button: 0, ctrlKey: false });
}
/** A moved affordance: goal tokens only, no colour literal and no reserved hue. */
function expectGoalClasses(className: string) {
  expect(className).not.toMatch(COLOR_LITERAL);
  expect(className).not.toMatch(RESERVED_HUE);
  expect(className).toMatch(GOAL_TOKEN);
}
const bellButton = () => document.querySelector('[data-skipwait-notification-bell="true"]');
async function waitForBell(ariaLabel: string) {
  await waitFor(() => expect(screen.getByRole("button", { name: ariaLabel })).toBeTruthy());
}

beforeEach(() => {
  bellState.unread = 0;
  bellState.calls = 0;
  accessReply = UNVERIFIED;
  authState.signedIn = true;
  clarityActive.value = false;
  consentV2.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
  // The banner is out of the way unless a test wants it.
  window.localStorage.setItem("skipwait:cookie-consent", "all");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); signOut.mockClear(); });

describe("shell parts: goal-token source rules (D-167 section 6.2)", () => {
  for (const file of ["AccountMenu.tsx", "NotificationBell.tsx", "CookieConsent.tsx"]) {
    it(`${file} carries no colour literal`, () => {
      expect(sourceOf(file)).not.toMatch(COLOR_LITERAL);
    });
    it(`${file} uses no kit/shadcn utility`, () => {
      expect(sourceOf(file)).not.toMatch(KIT_UTILITY);
    });
    it(`${file} is on the goal system`, () => {
      expect(sourceOf(file)).toMatch(GOAL_TOKEN);
      expect(sourceOf(file)).not.toMatch(RESERVED_HUE);
    });
  }

  it("BetaNotice.tsx uses no kit/shadcn utility (its kit tone only serves the unmoved /sign-in)", () => {
    expect(sourceOf("BetaNotice.tsx")).not.toMatch(KIT_UTILITY);
  });
});

describe("AccountMenu on the goal system", () => {
  it("keeps every menu entry and where it goes", async () => {
    for (const [name, href] of [...MENU_ITEMS, ...REFERRER_ITEMS]) {
      accessReply = VERIFIED;
      window.history.replaceState({}, "", "/");
      const view = renderMenu();
      openMenu();
      fireEvent.click(await screen.findByRole("menuitem", { name }));
      await waitFor(() => expect(window.location.pathname).toBe(href));
      view.unmount();
    }
  });

  it("keeps the referrer entries behind the server's verdict, and the rest of the menu usable after a failed check", async () => {
    renderMenu();
    openMenu();
    await screen.findByRole("menuitem", { name: "Settings" });
    expect(screen.queryByRole("menuitem", { name: "My Company Inbox" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "My impact" })).toBeNull();
    cleanup();

    accessReply = { error: "We could not check your company-email access" };
    const failed = renderMenu();
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Settings" }));
    await waitFor(() => expect(window.location.pathname).toBe("/settings"));
    expect(screen.queryByRole("menuitem", { name: "My impact" })).toBeNull();
    failed.unmount();
  });

  it("still signs out in one click from the menu", async () => {
    renderMenu();
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });

  it("wears the shell's avatar slot on goal tokens, with the profile image inside it", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Account menu" });
    expectGoalClasses(trigger.className);
    expect(trigger.className).toContain("rounded-full");
    expect(trigger.className).toContain("bg-g-surface-selected");
    expect(trigger.className).toContain("ring-g-hairline");
    expect(trigger.querySelector("img")?.getAttribute("src")).toBe("https://images.example.test/avery.png");
  });

  it("renders its portalled menu inside the goal scope, on goal surface tokens", async () => {
    renderMenu();
    openMenu();
    const menu = await screen.findByRole("menu");
    expectGoalClasses(menu.className);
    expect(menu.className).toContain("g-scope");
    expect(menu.className).toContain("bg-g-surface");
    expect(menu.className).toContain("rounded-g-popover");
    expect(menu.className).toContain("shadow-g-popover");
  });
});

describe("NotificationBell on the goal system", () => {
  it("counts unread updates, labels them and keeps the exact-count attribute", async () => {
    bellState.unread = 2;
    render(<NotificationBell />);
    await waitForBell("Notifications, 1 unread");
    expect(bellButton()?.querySelector('[data-skipwait-notification-count="1"]')?.textContent).toBe("1");
  });

  it("has no unread state of its own: no attribute and no badge when nothing is unread", async () => {
    render(<NotificationBell />);
    await waitForBell("Notifications");
    expect(bellButton()?.querySelector("[data-skipwait-notification-count]")).toBeNull();
  });

  it("caps the numeral at 9+ while the label and the attribute keep the real count", async () => {
    bellState.unread = 11;
    render(<NotificationBell />);
    await waitForBell("Notifications, 6 unread");
    const badge = bellButton()?.querySelector('[data-skipwait-notification-count="6"]');
    expect(badge?.textContent).toBe("6");
    bellState.unread = 21;
    cleanup();
    render(<NotificationBell />);
    await waitForBell("Notifications, 11 unread");
    const capped = bellButton()?.querySelector('[data-skipwait-notification-count="11"]');
    expect(capped?.textContent).toBe("9+");
  });

  it("opens /notifications and loads the count once, on mount, with no timer", async () => {
    bellState.unread = 1;
    render(<NotificationBell />);
    await waitForBell("Notifications, 1 unread");
    fireEvent.click(bellButton()!);
    expect(window.location.pathname).toBe("/notifications");
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/notifications")).toHaveLength(1);
  });

  it("renders nothing when signed out", () => {
    authState.signedIn = false;
    render(<NotificationBell />);
    expect(bellButton()).toBeNull();
  });

  it("wears goal geometry and the goal system's ink unread badge", async () => {
    bellState.unread = 1;
    render(<NotificationBell />);
    await waitForBell("Notifications, 1 unread");
    const button = bellButton()!;
    expectGoalClasses(button.className);
    expect(button.className).toContain("rounded-g-control");
    const badge = button.querySelector('[data-skipwait-notification-count="1"]')!;
    expectGoalClasses(badge.className);
    expect(badge.className).toContain("bg-g-ink");
  });
});

describe("BetaNotice on the goal system", () => {
  it("keeps the badge word, the notice line's words and its link", () => {
    render(<><BetaBadge tone="goal" /><BetaNoticeLine tone="goal" /></>);
    expect(screen.getByTestId("beta-badge").textContent).toBe("Beta");
    expect(screen.getByTestId("beta-notice-line").textContent).toContain("skipwait.me is in beta.");
    expect(screen.getByTestId("beta-notice-line").textContent).toContain("your feedback shapes it.");
    expect(screen.getByRole("link", { name: "feedback" }).getAttribute("href")).toBe("/help");
  });

  it("puts the goal tone on goal tokens, with no colour literal", () => {
    render(<><BetaBadge tone="goal" /><BetaNoticeLine tone="goal" /></>);
    expectGoalClasses(screen.getByTestId("beta-badge").className);
    expectGoalClasses(screen.getByTestId("beta-notice-line").className);
    expectGoalClasses(screen.getByRole("link", { name: "feedback" }).className);
  });

  it("keeps the kit tone free of goal tokens for /sign-in, which has not moved", () => {
    render(<BetaNoticeLine tone="kit" />);
    expect(screen.getByTestId("beta-notice-line").className).not.toMatch(GOAL_TOKEN);
    expect(screen.getByRole("link", { name: "feedback" }).className).not.toMatch(GOAL_TOKEN);
  });
});

describe("CookieConsent on the goal system", () => {
  const banner = () => screen.getByRole("dialog", { name: "Cookie choices" });

  it("keeps the wording, the Privacy link and both stored choices", () => {
    window.localStorage.clear();
    render(<CookieConsent />);
    expect(banner().textContent).toContain("Cookies, honestly.");
    expect(banner().textContent).toContain("Essential ones keep you signed in. Optional analytics help us improve - never sold, never ads.");
    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByTestId("cookie-consent-spacer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Essential only" }));
    expect(window.localStorage.getItem("skipwait:cookie-consent")).toBe("essential");
    expect(readCookieConsent()).toBe("essential");
    expect(screen.queryByRole("dialog", { name: "Cookie choices" })).toBeNull();
  });

  it("stores accept-all, applies it to Clarity at once, and stays away on the next visit", () => {
    window.localStorage.clear();
    clarityActive.value = true;
    render(<CookieConsent />);
    expect(consentV2).toHaveBeenLastCalledWith({ ad_Storage: "denied", analytics_Storage: "denied" });
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(window.localStorage.getItem("skipwait:cookie-consent")).toBe("all");
    expect(consentV2).toHaveBeenLastCalledWith({ ad_Storage: "denied", analytics_Storage: "granted" });
    cleanup();
    render(<CookieConsent />);
    expect(screen.queryByRole("dialog", { name: "Cookie choices" })).toBeNull();
  });

  it("treats an unknown stored value as no choice yet, and hides for this visit when storage is blocked", () => {
    window.localStorage.setItem("skipwait:cookie-consent", "maybe");
    render(<CookieConsent />);
    expect(banner()).toBeTruthy();
    cleanup();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    window.localStorage.clear();
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: "Essential only" }));
    expect(screen.queryByRole("dialog", { name: "Cookie choices" })).toBeNull();
    setItem.mockRestore();
  });

  it("puts the dialog on goal tokens and the popover rules", () => {
    window.localStorage.clear();
    render(<CookieConsent />);
    expectGoalClasses(banner().className);
    expect(banner().className).toContain("g-scope");
    expect(banner().className).toContain("rounded-g-popover");
    expect(banner().className).toContain("shadow-g-popover");
  });

  it("gives both choices GoalButton's ink-outline recipe, the same weight, and no black fill", () => {
    window.localStorage.clear();
    render(<><CookieConsent /><GoalButton variant="outline" touch="large">Recipe</GoalButton></>);
    const classesOf = (element: Element) => Array.from(element.classList).sort();
    const recipe = classesOf(screen.getByRole("button", { name: "Recipe" }));
    const essential = screen.getByRole("button", { name: "Essential only" });
    const accept = screen.getByRole("button", { name: "Accept all" });
    expect(classesOf(essential)).toEqual(recipe);
    expect(classesOf(accept)).toEqual(recipe);
    for (const choice of [essential, accept]) {
      expectGoalClasses(choice.className);
      expect(choice.className).not.toContain("bg-g-primary");
      expect(choice.hasAttribute("data-g-primary")).toBe(false);
    }
    expect(banner().querySelector('[class*="bg-g-primary"], [data-g-primary]')).toBeNull();
  });

  it("applyAnalyticsConsent denies ads always and analytics unless the visitor chose all", () => {
    clarityActive.value = true;
    applyAnalyticsConsent(null);
    expect(consentV2).toHaveBeenLastCalledWith({ ad_Storage: "denied", analytics_Storage: "denied" });
    applyAnalyticsConsent("essential");
    expect(consentV2).toHaveBeenLastCalledWith({ ad_Storage: "denied", analytics_Storage: "denied" });
    applyAnalyticsConsent("all");
    expect(consentV2).toHaveBeenLastCalledWith({ ad_Storage: "denied", analytics_Storage: "granted" });
    expect(consentV2).toHaveBeenCalledTimes(3);
  });

  it("applyAnalyticsConsent is a no-op when Clarity is not configured", () => {
    applyAnalyticsConsent("all");
    expect(consentV2).not.toHaveBeenCalled();
  });
});
