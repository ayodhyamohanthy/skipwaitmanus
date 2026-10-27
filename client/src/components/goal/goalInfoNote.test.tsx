// @vitest-environment jsdom
// GoalInfoNote: hover, focus and tap all open the note; Escape and outside
// blur close it; note content can hold a link without collapsing.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { GoalInfoNote } from "@/components/goal/GoalInfoNote";

function renderNote() {
  return render(
    <GoalInfoNote label="What are referrals?">
      Referrals are what you spend to send an ask. Each ask shows its cost before you send; referrals are used only when a verified employee can see it, never while it waits. A referral delivers your request - it is not a guaranteed referral.{" "}
      <a href="/plans">More about referrals on Plans</a>
    </GoalInfoNote>,
  );
}

describe("GoalInfoNote", () => {
  afterEach(() => cleanup());

  it("opens on mouse hover and closes when the pointer leaves", () => {
    const { container } = renderNote();
    const root = container.firstElementChild as HTMLElement;
    expect(screen.queryByRole("note")).toBeNull();
    fireEvent.pointerEnter(root, { pointerType: "mouse" });
    expect(screen.getByRole("note")).toBeTruthy();
    fireEvent.pointerLeave(root, { pointerType: "mouse" });
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("stays open when a mouse user hovers and then clicks", () => {
    // Real click order: hover opens the note, the click must pin it, not close it.
    const { container } = renderNote();
    const root = container.firstElementChild as HTMLElement;
    const button = screen.getByRole("button", { name: "What are referrals?" });
    fireEvent.pointerEnter(root, { pointerType: "mouse" });
    fireEvent.click(button);
    expect(screen.getByRole("note")).toBeTruthy();
    fireEvent.pointerLeave(root, { pointerType: "mouse" });
    expect(screen.getByRole("note")).toBeTruthy();
    fireEvent.click(button);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("opens on keyboard focus and closes on Escape", () => {
    renderNote();
    const button = screen.getByRole("button", { name: "What are referrals?" });
    fireEvent.focus(button);
    const note = screen.getByRole("note");
    expect(note).toBeTruthy();
    expect(button.getAttribute("aria-describedby")).toBe(note.id);
    fireEvent.keyDown(button, { key: "Escape" });
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("pins on tap and keeps a linked note open while focus moves inside", () => {
    renderNote();
    const button = screen.getByRole("button", { name: "What are referrals?" });
    fireEvent.pointerDown(button);
    fireEvent.focus(button);
    fireEvent.click(button);
    expect(screen.getByRole("note")).toBeTruthy();
    const link = screen.getByRole("link", { name: "More about referrals on Plans" });
    expect(link.getAttribute("href")).toBe("/plans");
    fireEvent.blur(button, { relatedTarget: link });
    expect(screen.getByRole("note")).toBeTruthy();
    fireEvent.pointerDown(button);
    fireEvent.click(button);
    fireEvent.blur(button, { relatedTarget: null });
    expect(screen.queryByRole("note")).toBeNull();
  });
});
