// @vitest-environment jsdom
// Goal-UI composite pins (packet §6b). Behaviour only; pixel checks are §6c.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoalShell } from "./GoalShell";
import { GoalCompanyRow, GoalListRow } from "./GoalListRow";
import { GoalDetailPane } from "./GoalDetailPane";
import { GoalDecisionBar } from "./GoalDecisionBar";
import { GoalPassReasons } from "./GoalPassReasons";
import { GoalDrawer } from "./GoalDrawer";
import { GoalSheet } from "./GoalSheet";
import { GoalButton } from "./GoalButton";
import { GoalErrorState, GoalSkeletonRows } from "./GoalStates";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { PASS_REASON_OPTIONS } from "@shared/passReasons";

afterEach(cleanup);

function stubMatchMedia(desktop: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: desktop,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

beforeEach(() => stubMatchMedia(true));

const SHELL_PROPS = {
  active: "queue" as const,
  pageTitle: "Referral queue",
  credits: null,
  account: { initials: "AB" },
  alertsHref: "/alerts",
};

/** The shell and its rows navigate with wouter Links, so they need a router even in jsdom. */
function renderInRouter(ui: ReactElement) {
  const location = memoryLocation({ path: "/queue", record: true });
  render(<Router hook={location.hook} searchHook={location.searchHook}>{ui}</Router>);
  return location;
}

describe("GoalShell", () => {
  it("links every nav item to its route, with aria-current on the active one", () => {
    renderInRouter(<GoalShell {...SHELL_PROPS} verifiedReferrer><p>content</p></GoalShell>);
    const primaryNavs = screen.getAllByRole("navigation", { name: /primary/i });
    expect(primaryNavs.length).toBeGreaterThan(0);
    const current = screen.getAllByRole("link", { current: "page" });
    expect(current[0].getAttribute("href")).toBe("/queue");
    const hrefs = primaryNavs.flatMap(nav => Array.from(nav.querySelectorAll("a")).map(a => a.getAttribute("href")));
    for (const href of ["/explore", "/requests", "/queue", "/inbox"]) expect(hrefs).toContain(href);
  });

  it("hides the queue for a non-referrer and shows Give a referral to the referrer sign-in", () => {
    renderInRouter(<GoalShell {...SHELL_PROPS} active="find" verifiedReferrer={false}><p>content</p></GoalShell>);
    const navs = screen.getAllByRole("navigation", { name: /primary/i });
    const hrefs = navs.flatMap(nav => Array.from(nav.querySelectorAll("a")).map(a => a.getAttribute("href")));
    expect(hrefs).not.toContain("/queue");
    for (const link of screen.getAllByTestId("goal-give-referral")) {
      expect(link.getAttribute("href")).toBe(referrerSignInHref());
    }
  });

  it("phone layout: main is pinned to grid row 2 so it never drops into an implicit row", () => {
    // Regression (Oct 21): the sticky phone bottom bar spans rows 2..-1, so an
    // auto-placed <main> skipped the occupied rows and landed in an implicit
    // 4th row - signed-in pages rendered a blank first viewport at 390px.
    render(<GoalShell {...SHELL_PROPS} verifiedReferrer><p>content</p></GoalShell>);
    const main = screen.getByRole("main");
    expect(main.className).toContain("max-gdesk:row-start-2");
    expect(main.className).toContain("max-gdesk:col-start-1");
    // The bottom bar must keep its explicit span; removing either side of this
    // contract re-opens the implicit-row bug above.
    const bottomBar = screen.getAllByRole("navigation", { name: /primary/i }).find(nav => nav.className.includes("max-gdesk:sticky"));
    expect(bottomBar?.className).toContain("max-gdesk:row-start-2");
  });

  it("renders no credits pill when credits is null", () => {
    renderInRouter(<GoalShell {...SHELL_PROPS} verifiedReferrer><p>content</p></GoalShell>);
    expect(screen.queryByTestId("goal-credits-pill")).toBeNull();
  });

  it("a ready credit balance is a real link to the credit details, never a dead number", () => {
    renderInRouter(<GoalShell {...SHELL_PROPS} verifiedReferrer credits={{ state: "ready", count: 4 }}><p>content</p></GoalShell>);
    const pills = screen.getAllByTestId("goal-credits-pill");
    expect(pills[0].textContent).toBe("4 credits");
    expect(pills[0].getAttribute("href")).toBe("/plans");
    expect(pills[0].getAttribute("aria-label")).toBe("4 credits available. Open credit details");
  });

  it("the account slot prefers the adapter's menu (sign-in when signed out) and otherwise shows the account-menu button", () => {
    renderInRouter(<GoalShell {...SHELL_PROPS} verifiedReferrer><p>content</p></GoalShell>);
    const avatar = screen.getAllByTestId("goal-avatar")[0];
    expect(avatar.tagName).toBe("BUTTON");
    expect(avatar.getAttribute("aria-label")).toBe("Account menu");
    cleanup();
    // AppShell passes account.menu for signed-out visitors (a Sign in link); the shell must render it, not an avatar.
    renderInRouter(<GoalShell {...SHELL_PROPS} verifiedReferrer account={{ initials: "·", menu: <a href="/sign-in">Sign in</a> }}><p>content</p></GoalShell>);
    expect(screen.queryByTestId("goal-avatar")).toBeNull();
    expect(screen.getAllByRole("link", { name: "Sign in" }).length).toBeGreaterThan(0);
  });

  it("credits error renders the error copy and never 0", () => {
    renderInRouter(<GoalShell {...SHELL_PROPS} verifiedReferrer credits={{ state: "error", onRetry: () => {} }}><p>content</p></GoalShell>);
    const pills = screen.getAllByTestId("goal-credits-pill");
    expect(pills[0].textContent).toContain("Balance didn't load");
    expect(pills[0].textContent).not.toContain("0");
  });

  it("root carries g-scope", () => {
    renderInRouter(<GoalShell {...SHELL_PROPS} verifiedReferrer><p>content</p></GoalShell>);
    expect(screen.getByTestId("goal-shell").className).toContain("g-scope");
  });
});

describe("GoalListRow", () => {
  it("selected renders aria-current=true", () => {
    render(<ul><GoalListRow density="queue" title="Role title" selected onSelect={() => {}} /></ul>);
    expect(screen.getByRole("button").getAttribute("aria-current")).toBe("true");
  });

  it("selectable=false never renders aria-current", () => {
    render(<ul><GoalListRow density="queue" title="Role title" selected selectable={false} onSelect={() => {}} /></ul>);
    expect(screen.getByRole("button").getAttribute("aria-current")).toBeNull();
  });
});

describe("GoalDecisionBar", () => {
  const base = {
    secondary: { label: "Pass", onClick: vi.fn(), expanded: false },
    primary: { label: "Accept", onClick: vi.fn() },
  };

  it("Pass carries dialog semantics and follows expanded", () => {
    render(<GoalDecisionBar {...base} />);
    const pass = screen.getByRole("button", { name: /pass/i });
    expect(pass.getAttribute("aria-haspopup")).toBe("dialog");
    expect(pass.getAttribute("aria-expanded")).toBe("false");
  });

  it("renders sr-only position text from props", () => {
    render(<GoalDecisionBar {...base} position={{ index: 2, total: 9, onPrev: () => {}, onNext: () => {} }} />);
    expect(screen.getByText("Ask 2 of 9").className).toContain("sr-only");
  });

  it("key p triggers the secondary intent and key a the primary intent without committing", () => {
    const secondary = { ...base.secondary, onClick: vi.fn() };
    const primary = { ...base.primary, onClick: vi.fn() };
    render(<GoalDecisionBar secondary={secondary} primary={primary} />);
    fireEvent.keyDown(window, { key: "p" });
    expect(secondary.onClick).toHaveBeenCalledTimes(1);
    expect(primary.onClick).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "a" });
    expect(primary.onClick).toHaveBeenCalledTimes(1);
  });

  it("ignores keys while focus is in an input", () => {
    const secondary = { ...base.secondary, onClick: vi.fn() };
    render(<div><input aria-label="note" /><GoalDecisionBar secondary={secondary} primary={base.primary} /></div>);
    fireEvent.keyDown(screen.getByLabelText("note"), { key: "p" });
    expect(secondary.onClick).not.toHaveBeenCalled();
  });
});

describe("GoalPassReasons", () => {
  const props = { open: true, onOpenChange: () => {}, title: "Pass on this ask", description: "Pick a reason", cancelLabel: "Cancel", confirmLabel: "Pass", onConfirm: vi.fn(), onCancel: vi.fn() };

  it("lists the 7 shipped reasons in order, none checked, Pass aria-disabled until a pick", () => {
    render(<div className="relative"><GoalPassReasons {...props} /></div>);
    const radios = screen.getAllByRole("radio");
    expect(radios.map(radio => radio.textContent)).toEqual(PASS_REASON_OPTIONS.map(option => String(option.label) + String(PASS_REASON_OPTIONS.indexOf(option) + 1)));
    expect(radios.every(radio => radio.getAttribute("aria-checked") === "false")).toBe(true);
    const pass = screen.getByRole("button", { name: /^pass$/i });
    expect(pass.getAttribute("aria-disabled")).toBe("true");
  });

  it("key 3 checks the third reason without confirming", () => {
    render(<div className="relative"><GoalPassReasons {...props} /></div>);
    fireEvent.keyDown(window, { key: "3" });
    const radios = screen.getAllByRole("radio");
    expect(radios[2].getAttribute("aria-checked")).toBe("true");
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});

describe("GoalDrawer and GoalSheet", () => {
  it("drawer opens as a dialog named by its title and closes on Escape", async () => {
    const onOpenChange = vi.fn();
    render(<GoalDrawer open onOpenChange={onOpenChange} title="Write your ask" closeLabel="Close" footer={<p>footer</p>}><p>body</p></GoalDrawer>);
    expect(screen.getByRole("dialog", { name: /write your ask/i })).toBeTruthy();
    expect(screen.getByTestId("goal-drawer").className).toContain("g-scope");
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("sheet opens as a dialog named by its title", () => {
    render(<GoalSheet open onOpenChange={() => {}} title="Pass on this ask"><p>body</p></GoalSheet>);
    expect(screen.getByRole("dialog", { name: /pass on this ask/i })).toBeTruthy();
    expect(screen.getByTestId("goal-sheet").className).toContain("g-scope");
  });
});

describe("GoalCompanyRow", () => {
  it("is a 52px selectable row named by company, with no availability framing (D-176), never a fake link", async () => {
    const onSelect = vi.fn();
    render(<GoalCompanyRow name="Wipro" initials="W" functions={["Engineering", "Data"]} onSelect={onSelect} />);
    const row = screen.getByRole("button", { name: "Wipro" });
    expect(row.className).toContain("h-[52px]");
    expect(row.getAttribute("href")).toBeNull();
    expect(screen.queryByTestId("goal-availability")).toBeNull();
    await userEvent.click(row);
    expect(onSelect).toHaveBeenCalled();
  });

  it("with href is a real anchor to the company page; a plain click is enhanced into the drawer", async () => {
    const onSelect = vi.fn();
    render(<GoalCompanyRow name="Wipro" initials="W" functions={["Engineering"]} href="/explore/wipro" onSelect={onSelect} />);
    const row = screen.getByRole("link", { name: "Wipro" });
    expect(row.getAttribute("href")).toBe("/explore/wipro");
    await userEvent.click(row);
    expect(onSelect).toHaveBeenCalled();
  });

  it("marks the selected row with the ink bar and aria-current", () => {
    render(<GoalCompanyRow name="Merkle" initials="M" functions={["Design"]} selected />);
    const row = screen.getByRole("button", { name: "Merkle" });
    expect(row.getAttribute("aria-current")).toBe("true");
    expect(row.className).toContain("bg-g-surface-selected");
  });
});

describe("composition", () => {
  it("a queue detail frame renders exactly one data-g-primary", () => {
    render(
      <div className="g-scope">
        <GoalDetailPane labelledBy="t" title="Role title" titleSize="display"><p>body</p></GoalDetailPane>
        <GoalDecisionBar secondary={{ label: "Pass", onClick: () => {} }} primary={{ label: "Accept", onClick: () => {} }} />
      </div>,
    );
    expect(document.querySelectorAll("[data-g-primary]").length).toBe(1);
  });
});

describe("GoalStates", () => {
  it("error has role=alert and a working retry", async () => {
    const onRetry = vi.fn();
    render(<GoalErrorState title="We couldn't load your asks" retry={{ label: "Try again", onClick: onRetry }} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("skeleton container is aria-busy", () => {
    render(<GoalSkeletonRows density="queue" count={3} />);
    expect(screen.getByTestId("goal-skeleton-rows").getAttribute("aria-busy")).toBe("true");
  });
});
