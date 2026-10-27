// @vitest-environment jsdom
// D-048-dark-mode §5: the per-device theme choice is light by default, reads
// `sw-theme`, writes it on toggle, and never throws when storage is denied.
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeContext";

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button type="button" onClick={toggleTheme}>
      theme:{theme}
    </button>
  );
}

function renderProbe(props: { defaultTheme?: "light" | "dark"; switchable?: boolean } = {}) {
  return render(
    <ThemeProvider {...props}>
      <Probe />
    </ThemeProvider>,
  );
}

describe("ThemeProvider per-device theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("defaults to light with no stored choice", () => {
    renderProbe({ switchable: true });
    expect(screen.getByRole("button").textContent).toBe("theme:light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("applies a stored sw-theme=dark choice on mount", () => {
    localStorage.setItem("sw-theme", "dark");
    renderProbe({ switchable: true });
    expect(screen.getByRole("button").textContent).toBe("theme:dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggling writes sw-theme and flips the root class", () => {
    renderProbe({ switchable: true });
    fireEvent.click(screen.getByRole("button"));
    expect(localStorage.getItem("sw-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    fireEvent.click(screen.getByRole("button"));
    expect(localStorage.getItem("sw-theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("ignores storage and stays on its default when not switchable", () => {
    localStorage.setItem("sw-theme", "dark");
    renderProbe();
    expect(screen.getByRole("button").textContent).toBe("theme:light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("falls back to light without throwing when localStorage is denied", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => renderProbe({ switchable: true })).not.toThrow();
    expect(screen.getByRole("button").textContent).toBe("theme:light");
    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
    expect(screen.getByRole("button").textContent).toBe("theme:dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
