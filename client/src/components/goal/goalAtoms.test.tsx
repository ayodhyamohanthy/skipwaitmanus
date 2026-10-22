// @vitest-environment jsdom
// Goal-UI atom pins (packet §6b). Token values (text-g-*, g-* radii) resolve
// only through the built CSS; here we pin behaviour, roles and class hooks.
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoalButton } from "./GoalButton";
import { GoalSearchInput } from "./GoalSearchInput";
import { GoalFilterChip } from "./GoalFilterChip";
import { GoalReasonInput } from "./GoalReasonInput";
import { GoalStatus } from "./GoalStatus";
import { GoalVerifiedMark } from "./GoalVerifiedMark";

afterEach(cleanup);

describe("GoalButton", () => {
  it("marks the primary variant with data-g-primary", () => {
    render(<GoalButton variant="primary">Send ask</GoalButton>);
    expect(screen.getByTestId("goal-button").getAttribute("data-g-primary")).toBe("true");
  });

  it("swallows clicks when aria-disabled instead of the native disabled attr", async () => {
    const onClick = vi.fn();
    render(<GoalButton disabledReason="You're offline" onClick={onClick}>Send ask</GoalButton>);
    const button = screen.getByTestId("goal-button");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("disabled")).toBeNull();
    const reason = document.getElementById(button.getAttribute("aria-describedby")!);
    expect(reason?.textContent).toMatch(/offline/i);
  });

  it("never uses the native disabled attribute, even when busy", () => {
    render(<GoalButton busy busyLabel="Sending your ask…">Send ask</GoalButton>);
    const button = screen.getByTestId("goal-button");
    expect(button.getAttribute("disabled")).toBeNull();
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.textContent).toContain("Sending your ask…");
  });

  it("renders keycaps aria-hidden and never as the only label", () => {
    render(<GoalButton variant="primary" keys={["⌘", "↵"]}>Send ask</GoalButton>);
    const button = screen.getByTestId("goal-button");
    expect(button.textContent).toContain("Send ask");
    const keycapWrapper = button.querySelector("span[aria-hidden='true']");
    expect(keycapWrapper).not.toBeNull();
    expect(keycapWrapper!.textContent).toContain("⌘");
  });

  it("renders as an anchor with asChild (link buttons such as Ask for a referral)", () => {
    render(<GoalButton variant="primary" asChild><a href="/explore">Ask for a referral</a></GoalButton>);
    const link = screen.getByRole("link", { name: /ask for a referral/i });
    expect(link.getAttribute("data-g-primary")).toBe("true");
    expect(link.tagName).toBe("A");
  });
});

describe("GoalSearchInput", () => {
  it("is a searchbox labelled by the given label", () => {
    render(<GoalSearchInput label="Search companies" value="" onChange={() => {}} placeholder="Company, function or level" />);
    expect(screen.getByRole("searchbox", { name: /search companies/i })).toBeTruthy();
  });
});

describe("GoalFilterChip", () => {
  it("toggles aria-pressed", async () => {
    const onPressedChange = vi.fn();
    render(<GoalFilterChip label="Open to refer" pressed={false} onPressedChange={onPressedChange} />);
    const chip = screen.getByTestId("goal-filter-chip");
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(chip);
    expect(onPressedChange).toHaveBeenCalledWith(true);
  });
});

describe("GoalReasonInput", () => {
  it("labels itself as one of the three reasons and counts characters live", async () => {
    const onChange = vi.fn();
    render(<GoalReasonInput index={1} value="" onChange={onChange} max={140} placeholder="Another result…" />);
    expect(screen.getByRole("textbox", { name: "Reason 2" })).toBeTruthy();
    expect(screen.getByText("0/140")).toBeTruthy();
    await userEvent.type(screen.getByPlaceholderText("Another result…"), "Led checkout");
    expect(onChange).toHaveBeenCalled();
  });

  it("flags an over-limit reason without disabling the field", () => {
    render(<GoalReasonInput index={0} value={"x".repeat(141)} onChange={() => {}} max={140} placeholder="One result…" />);
    const field = screen.getByPlaceholderText("One result…");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("disabled")).toBeNull();
    expect(screen.getByText(/141\/140/)).toBeTruthy();
  });
});

describe("GoalStatus tone map", () => {
  it.each([
    ["referred", "text-g-emerald"],
    ["accepted", "text-g-ink"],
    ["expired", "text-g-crimson"],
    ["withdrawn", "text-g-ink-3"],
    ["waiting", "text-g-amber"],
    ["under_review", "text-g-amber"],
  ] as const)("%s renders %s", (status, tone) => {
    render(<GoalStatus status={status} label={status} />);
    expect(screen.getByTestId("goal-status").className).toContain(tone);
  });

  it("queue_review renders no dot", () => {
    render(<GoalStatus status="queue_review" label="Under review" />);
    const status = screen.getByTestId("goal-status");
    expect(status.querySelector("span.rounded-full")).toBeNull();
  });

  it("queue_new renders an ink dot", () => {
    render(<GoalStatus status="queue_new" label="New" />);
    expect(screen.getByTestId("goal-status").querySelector("span.rounded-full")).not.toBeNull();
  });
});

describe("GoalVerifiedMark", () => {
  it("is the only user of g-trust", () => {
    render(<GoalVerifiedMark>Verified · Acme</GoalVerifiedMark>);
    const mark = screen.getByTestId("goal-verified-mark");
    expect(mark.className).toContain("text-g-trust");
    expect(mark.textContent).toBe("Verified · Acme");
  });

  it("mutedText keeps the check blue and quiets the label to ink-2 (queue header rule)", () => {
    render(<GoalVerifiedMark mutedText>Verified · Acme</GoalVerifiedMark>);
    const mark = screen.getByTestId("goal-verified-mark");
    expect(mark.className).toContain("text-g-ink-2");
    expect(mark.className).not.toContain("text-g-trust");
    expect(mark.querySelector("svg")?.getAttribute("class")).toContain("text-g-trust");
  });
});
