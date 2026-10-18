// @vitest-environment jsdom
import { PASS_REASON_OPTIONS } from "@shared/passReasons";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import {
  GoalButton,
  GoalDecisionBar,
  GoalDrawer,
  GoalErrorState,
  GoalFilterChip,
  GoalListRow,
  GoalPassReasons,
  GoalShell,
  GoalSkeletonRows,
  GoalStatus,
  GoalVerifiedMark,
} from "./index";

const PASS_COPY = {
  title: "Pass privately",
  description: "The seeker sees a kind note with your reason. Never your name.",
  note: "With Prefer not to say, the seeker sees no reason.",
  cancel: "Cancel",
  confirm: "Pass",
};

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GoalButton", () => {
  it("never uses the native disabled attribute and swallows clicks while unavailable", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<GoalButton variant="primary" disabledReason="You're offline." onClick={onClick}>Send ask</GoalButton>);
    const button = screen.getByRole("button", { name: "Send ask" });
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent).toBe("You're offline.");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows an honest busy label and marks itself busy", () => {
    render(<GoalButton variant="primary" busy busyLabel="Sending your ask…">Send ask</GoalButton>);
    const button = screen.getByRole("button", { name: "Sending your ask…" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
  });

  it("marks the primary and hides keycap hints from assistive tech", () => {
    render(<GoalButton variant="primary" keys={["A"]}>Accept &amp; connect</GoalButton>);
    const button = screen.getByRole("button", { name: "Accept & connect" });
    expect(button.hasAttribute("data-g-primary")).toBe(true);
    expect(button.querySelector("[data-g-keycaps]")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders a link when asChild", () => {
    render(<GoalButton asChild variant="primary"><a href="/explore">Ask for a referral</a></GoalButton>);
    expect(screen.getByRole("link", { name: "Ask for a referral" }).getAttribute("href")).toBe("/explore");
  });
});

describe("small primitives", () => {
  it("GoalFilterChip reflects its state in aria-pressed", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [pressed, setPressed] = useState(false);
      return <GoalFilterChip pressed={pressed} onPressedChange={setPressed}>Engineering</GoalFilterChip>;
    }
    render(<Harness />);
    const chip = screen.getByRole("button", { name: "Engineering" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    await user.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
  });

  it("GoalListRow marks the selected row with aria-current, and not when unselectable", () => {
    const { rerender } = render(<ul><GoalListRow density="queue" title="Role" selected onSelect={() => {}} /></ul>);
    expect(screen.getByRole("button", { name: "Role" }).getAttribute("aria-current")).toBe("true");
    rerender(<ul><GoalListRow density="queue" title="Role" selected selectable={false} onSelect={() => {}} /></ul>);
    expect(screen.getByRole("button", { name: "Role" }).hasAttribute("aria-current")).toBe(false);
  });

  it("GoalStatus colours by role: Accepted is ink, Referred emerald, Expired crimson, Withdrawn ink-3", () => {
    const tone = (status: Parameters<typeof GoalStatus>[0]["status"]) => {
      const { container, unmount } = render(<GoalStatus status={status} label="x" />);
      const className = (container.firstElementChild as HTMLElement).className;
      unmount();
      return className;
    };
    expect(tone("accepted")).toContain("text-g-ink");
    expect(tone("accepted")).not.toContain("text-g-emerald");
    expect(tone("referred")).toContain("text-g-emerald");
    expect(tone("expired")).toContain("text-g-crimson");
    expect(tone("withdrawn")).toContain("text-g-ink-3");
    expect(tone("waiting")).toContain("text-g-amber");
  });

  it("GoalVerifiedMark is trust blue with a hidden icon", () => {
    render(<GoalVerifiedMark>Verified · Acme</GoalVerifiedMark>);
    const mark = screen.getByTestId("goal-verified-mark");
    expect(mark.className).toContain("text-g-trust");
    expect(mark.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("GoalErrorState is an alert with a retry, and skeletons are busy", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(
      <>
        <GoalErrorState title="We couldn’t load companies." retry={{ label: "Try again", onClick: retry }} />
        <GoalSkeletonRows density="company" />
      </>,
    );
    await user.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});

describe("GoalPassReasons", () => {
  it("lists the seven shipped reasons in order with none preselected, and Pass waits for a pick", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<GoalPassReasons copy={PASS_COPY} variant="popover" onCancel={() => {}} onConfirm={onConfirm} />);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map(radio => radio.value)).toEqual(PASS_REASON_OPTIONS.map(option => option.code));
    expect(radios.some(radio => radio.checked)).toBe(false);
    const pass = screen.getByRole("button", { name: "Pass" });
    expect(pass.getAttribute("aria-disabled")).toBe("true");
    await user.click(pass);
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole("radio", { name: "Role is closed" }));
    expect(pass.hasAttribute("aria-disabled")).toBe(false);
    await user.click(pass);
    expect(onConfirm).toHaveBeenCalledWith("role_closed");
  });

  it("picks a reason with its number key without committing", () => {
    const onConfirm = vi.fn();
    render(<GoalPassReasons copy={PASS_COPY} variant="popover" onCancel={() => {}} onConfirm={onConfirm} />);
    fireEvent.keyDown(window, { key: "3" });
    expect((screen.getByRole("radio", { name: "Not enough context" }) as HTMLInputElement).checked).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("GoalShell", () => {
  const base = { pageTitle: "Find a referral", alerts: { href: "/notifications", unread: 0 }, account: { initials: "AB", name: "A B", items: [{ label: "Settings", href: "/settings" }] } } as const;

  it("shows a non-referrer Find, My asks, Inbox and the quiet Give a referral link", () => {
    render(<GoalShell {...base} active="find" verifiedReferrer={false} credits={{ state: "ready", count: 2, href: "/plans" }}><p>content</p></GoalShell>);
    const shell = screen.getByTestId("goal-shell");
    expect(shell.className).toContain("g-scope");
    const rail = within(shell).getAllByRole("navigation", { name: "Primary" })[0];
    expect(within(rail).getAllByRole("link").map(link => link.textContent)).toEqual(["SkipWait", "Find", "My asks", "Inbox", "Give a referralWork email only"]);
    expect(within(rail).getByRole("link", { name: "Find" }).getAttribute("aria-current")).toBe("page");
    const give = within(rail).getByRole("link", { name: /Give a referral/ });
    expect(give.getAttribute("href")).toBe(referrerSignInHref());
    expect(screen.getByRole("link", { name: "2 credits available. Open credit details" }).getAttribute("href")).toBe("/plans");
  });

  it("gives a verified referrer the queue, no Give a referral link and no credits pill", () => {
    render(<GoalShell {...base} active="queue" verifiedReferrer credits={null}><p>content</p></GoalShell>);
    const rail = screen.getAllByRole("navigation", { name: "Primary" })[0];
    expect(within(rail).getAllByRole("link").map(link => link.textContent)).toEqual(["SkipWait", "Find", "My asks", "Queue", "Inbox"]);
    expect(screen.queryByText("Give a referral")).toBeNull();
    expect(screen.queryByTestId("goal-credits")).toBeNull();
  });

  it("never shows 0 when the balance failed to load", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<GoalShell {...base} active="asks" verifiedReferrer={false} credits={{ state: "error", onRetry: retry }}><p>content</p></GoalShell>);
    expect(screen.getByText(/Balance didn’t load/)).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Your balance didn’t load. Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("offers Sign in instead of an account when signed out", () => {
    render(<GoalShell {...base} account={null} alerts={null} active="find" verifiedReferrer={false} credits={null} signInHref="/sign-in?returnTo=%2Fexplore"><p>content</p></GoalShell>);
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in?returnTo=%2Fexplore");
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
  });
});

describe("GoalDrawer", () => {
  it("is a titled dialog that Escape closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <GoalDrawer open onOpenChange={onOpenChange} title="Ask for a referral" context="Acme · Engineer" closeLabel="Close" footer={<p>footer</p>}>
        <input aria-label="Job link" data-g-autofocus="" />
      </GoalDrawer>,
    );
    const dialog = screen.getByRole("dialog", { name: "Ask for a referral" });
    expect(dialog.className).toContain("g-scope");
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Job link" }));
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("GoalDecisionBar", () => {
  function Bar({ onAccept, onPassOpen }: { onAccept: () => void; onPassOpen: (open: boolean) => void }) {
    return (
      <>
        <textarea aria-label="Notes" />
        <GoalDecisionBar
          position={{ index: 1, total: 5 }}
          secondary={{ label: "Pass privately", keyHint: "P" }}
          primary={{ label: "Accept & connect", keyHint: "A", onClick: onAccept }}
          pass={{ open: false, onOpenChange: onPassOpen, title: "Pass privately", content: <p>reasons</p> }}
        />
      </>
    );
  }

  it("opens steps from keys and never while typing", () => {
    const onAccept = vi.fn();
    const onPassOpen = vi.fn();
    render(<Bar onAccept={onAccept} onPassOpen={onPassOpen} />);
    fireEvent.keyDown(window, { key: "a" });
    expect(onAccept).toHaveBeenCalledOnce();
    fireEvent.keyDown(window, { key: "p" });
    expect(onPassOpen).toHaveBeenCalledWith(true);
    const notes = screen.getByRole("textbox", { name: "Notes" });
    act(() => notes.focus());
    fireEvent.keyDown(notes, { key: "a" });
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it("renders exactly one primary and announces the position", () => {
    render(<Bar onAccept={() => {}} onPassOpen={() => {}} />);
    expect(document.querySelectorAll("[data-g-primary]")).toHaveLength(1);
    expect(screen.getByText("Ask 1 of 5")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pass privately/ }).getAttribute("aria-haspopup")).toBe("dialog");
  });
});
