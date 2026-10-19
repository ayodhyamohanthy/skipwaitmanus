// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Landed from "./Landed";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const classesOf = (element: HTMLElement) => element.className.split(" ");

describe("Landed journey (kit v4)", () => {
  it("celebrates with the kit muted body and kit Button, without preview scaffolding or sample people", () => {
    const { container } = render(<Landed />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("You did it.");
    const body = screen.getByText("You did the work. A referrer opened the door. Let's close the loop kindly.");
    expect(classesOf(body)).toEqual(expect.arrayContaining(["text-muted-foreground"]));
    expect(classesOf(body)).not.toContain("text-lg");
    expect(classesOf(screen.getByRole("button", { name: /Thank your referrer/ }))).toEqual(expect.arrayContaining(["text-sm", "font-medium", "h-9"]));
    for (const scaffold of [/EXAMPLE/i, /Illustrative outcome/i, /Replay preview/i, /Wipro|Rahul|Product Designer/]) expect(screen.queryByText(scaffold)).toBeNull();
    expect(container.innerHTML).not.toContain("var(--");
  });

  it("restores the kit thank-you copy, muted gift panel and Skip / Copy thanks actions", () => {
    render(<Landed />);
    fireEvent.click(screen.getByRole("button", { name: /Thank your referrer/ }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Say thanks.");
    expect(screen.getByText("The single message referrers remember most.")).toBeTruthy();
    expect(screen.queryByText(/Copy it into your conversation/)).toBeNull();
    const textarea = screen.getByLabelText("Thank-you message");
    expect(textarea.getAttribute("rows")).toBeNull();
    expect(classesOf(textarea)).toEqual(expect.arrayContaining(["min-h-36"]));
    const gift = screen.getByText(/Gifts or payments for referrals/).closest("section") as HTMLElement;
    expect(classesOf(gift)).toEqual(expect.arrayContaining(["bg-muted", "rounded-3xl", "mt-6"]));
    expect(screen.queryByText(/thank-you wall/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Open my requests" })).toBeNull();
    expect(classesOf(screen.getByRole("button", { name: "Skip" }))).not.toContain("brand-button");
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Hold the door for the next person.");
  });

  it("copies the edited thanks, then moves to paying it forward", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<Landed />);
    fireEvent.click(screen.getByRole("button", { name: /Thank your referrer/ }));
    fireEvent.change(screen.getByLabelText("Thank-you message"), { target: { value: "Thank you, truly." } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy thanks" })); });
    expect(writeText).toHaveBeenCalledWith("Thank you, truly.");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Hold the door for the next person.");
  });

  it("states the kit pay-it-forward terms and finishes on real routes", () => {
    render(<Landed />);
    fireEvent.click(screen.getByRole("button", { name: /Thank your referrer/ }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("Once you have your new work email, verify in 30 seconds and refer people you believe in — at your own pace.")).toBeTruthy();
    expect(screen.getByText("Set your own capacity")).toBeTruthy();
    expect(screen.getByText("Even 1 request a month helps.")).toBeTruthy();
    const back = screen.getByRole("link", { name: "Back to SkipWait" });
    expect(back.getAttribute("href")).toBe("/explore");
    expect(classesOf(back)).toEqual(expect.arrayContaining(["brand-button", "border-2", "text-sm"]));
    fireEvent.click(screen.getByRole("button", { name: "Yes, I'll pay it forward" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Welcome to the other side of the door.");
    expect(screen.getByRole("link", { name: "Close my other asks" }).getAttribute("href")).toBe("/requests");
    expect(screen.getByRole("link", { name: /Verify work email/ }).getAttribute("href")).toBe("/verify");
  });
});
