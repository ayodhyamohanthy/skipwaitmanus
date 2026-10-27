// @vitest-environment jsdom
// W0 "More" (designer, Oct 21 2026): exact button name, the four disclosure
// rows, opens upward, closes on Escape and on outside pointer.
// D-048-dark-mode §3.2: one ghost Appearance control switches Light/Dark.
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { GoalMoreMenu } from "./GoalMoreMenu";

describe("GoalMoreMenu (W0)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("renders a button named exactly More in both variants", () => {
    render(<><GoalMoreMenu variant="rail" /><GoalMoreMenu variant="bar" /></>);
    expect(screen.getAllByRole("button", { name: "More" })).toHaveLength(2);
  });

  it("opens upward with the four disclosure rows and closes on Escape", () => {
    render(<GoalMoreMenu variant="rail" />);
    const button = screen.getByRole("button", { name: "More" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("menu", { name: "More" });
    expect(menu.className).toContain("bottom-full");
    const rows = screen.getAllByRole("menuitem");
    expect(rows.map(row => row.textContent)).toEqual(["Help & safety", "Terms", "Privacy", "Support"]);
    expect(rows.map(row => row.getAttribute("href"))).toEqual(["/help", "/terms", "/privacy", "/support"]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on an outside pointer and never on a click inside the card", () => {
    render(<div><GoalMoreMenu variant="bar" /><button type="button">elsewhere</button></div>);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.pointerDown(screen.getByRole("menu", { name: "More" }));
    expect(screen.queryByRole("menu")).not.toBeNull();
    fireEvent.pointerDown(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("shows Appearance as a ghost control that switches to dark and closes the menu", () => {
    render(
      <ThemeProvider switchable>
        <GoalMoreMenu variant="rail" />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const toggle = screen.getByRole("menuitem", { name: "Appearance: Light" });
    expect(toggle.hasAttribute("data-g-primary")).toBe(false);
    expect(toggle.className).not.toContain("bg-g-primary");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("sw-theme")).toBe("dark");
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
