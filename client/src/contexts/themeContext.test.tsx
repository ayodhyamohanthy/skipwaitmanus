// @vitest-environment jsdom
// D-048-dark-mode / D-230: saved preference, exact route containment before
// paint, and temporary goal-scoped suppression of the theme transition dip.
import React from "react";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeContext";

const html = readFileSync("client/index.html", "utf8");
const prePaintScript = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), match => match[1])
  .find(source => source.includes('"sw-theme"'));
const DARK_ROUTES = ["/", "/explore", "/ask", "/requests", "/request"];
const LIGHT_ROUTES = [
  "/plans", "/wallet", "/explore/stripe", "/explore/stripe/jobs", "/ask/123",
  "/requests/123", "/request/123", "/requesting", "/explores", "/asking",
  "/sign-in", "/settings", "/inbox", "/referrer-home", "/billing", "/admin",
  "/unknown", "/Explore", "/Ask", "/%61sk", "/explor%65", "/explore//stripe",
  ...DARK_ROUTES.map(path => path === "/" ? "//" : `${path}//`),
];

function applyPrePaintTheme() {
  if (!prePaintScript) throw new Error("Theme pre-paint script missing from client/index.html");
  runInNewContext(prePaintScript, { document, localStorage, location: window.location });
}

function Probe({ observe }: { observe?: (value: string) => void }) {
  const { theme, toggleTheme, switchable } = useTheme();
  React.useEffect(() => {
    observe?.(`${theme}:${document.documentElement.classList.contains("dark")}`);
  }, [theme, observe]);
  return (
    <button type="button" onClick={toggleTheme} disabled={!toggleTheme} data-switchable={switchable}>
      theme:{theme}
    </button>
  );
}

function renderProbe(props: { defaultTheme?: "light" | "dark"; switchable?: boolean } = {}) {
  return render(<ThemeProvider {...props}><Probe /></ThemeProvider>);
}

function expectTheme(theme: "light" | "dark", switchable = true) {
  const button = screen.getByRole("button");
  expect(button.textContent).toBe(`theme:${theme}`);
  expect(button.getAttribute("data-switchable")).toBe(String(switchable));
  expect(button.hasAttribute("disabled")).toBe(!switchable);
  expect(document.documentElement.classList.contains("dark")).toBe(theme === "dark");
}

describe("ThemeProvider per-device theme", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/explore");
    localStorage.clear();
    document.documentElement.classList.remove("dark", "g-theme-switching");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.classList.remove("dark", "g-theme-switching");
  });

  it("defaults to light with no stored choice", () => {
    renderProbe({ switchable: true });
    expectTheme("light");
  });

  it("applies a stored sw-theme=dark choice on mount", () => {
    localStorage.setItem("sw-theme", "dark");
    renderProbe({ switchable: true });
    expectTheme("dark");
  });

  it("toggling writes sw-theme and flips the root class", () => {
    renderProbe({ switchable: true });
    fireEvent.click(screen.getByRole("button"));
    expect(localStorage.getItem("sw-theme")).toBe("dark");
    expectTheme("dark");
    fireEvent.click(screen.getByRole("button"));
    expect(localStorage.getItem("sw-theme")).toBe("light");
    expectTheme("light");
  });

  it("ignores storage and clears pre-paint dark when not switchable", () => {
    localStorage.setItem("sw-theme", "dark");
    applyPrePaintTheme();
    renderProbe();
    expectTheme("light", false);
    expect(localStorage.getItem("sw-theme")).toBe("dark");
  });

  it("falls back to light when storage is denied and still switches in-session", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    document.documentElement.classList.add("dark");
    expect(applyPrePaintTheme).not.toThrow();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(() => renderProbe({ switchable: true })).not.toThrow();
    expectTheme("light");
    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();
    expectTheme("dark");
    act(() => window.history.pushState(null, "", "/plans"));
    expectTheme("light", false);
    act(() => window.history.replaceState(null, "", "/ask"));
    expectTheme("dark");
  });

  it.each([null, "light", "system", "DARK", "invalid"])("pre-paint and provider default light for stored %s", stored => {
    if (stored !== null) localStorage.setItem("sw-theme", stored);
    document.documentElement.classList.add("dark");
    applyPrePaintTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    renderProbe({ switchable: true });
    expectTheme("light");
  });

  it.each(DARK_ROUTES.flatMap(path => path === "/" ? [path] : [path, `${path}/`]))(
    "pre-paint and provider admit only the exact dark-ready route %s", path => {
      window.history.replaceState(null, "", path);
      localStorage.setItem("sw-theme", "dark");
      applyPrePaintTheme();
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      renderProbe({ switchable: true });
      expectTheme("dark");
    },
  );

  it.each(LIGHT_ROUTES.flatMap(path => [path, `${path}/`]))(
    "pre-paint and provider keep uncaptured or malformed route %s light", path => {
      window.history.replaceState(null, "", `${window.location.origin}${path}`);
      localStorage.setItem("sw-theme", "dark");
      document.documentElement.classList.add("dark");
      applyPrePaintTheme();
      expect(document.documentElement.classList.contains("dark")).toBe(false);
      // Independently prove the provider removes a stale class, even without pre-paint.
      document.documentElement.classList.add("dark");
      renderProbe({ switchable: true });
      expectTheme("light", false);
      expect(localStorage.getItem("sw-theme")).toBe("dark");
    },
  );

  it("keeps the deliberate /request alias dark through its /ask redirect and query/hash changes", () => {
    window.history.replaceState(null, "", "/request/?company=stripe#note");
    localStorage.setItem("sw-theme", "dark");
    applyPrePaintTheme();
    renderProbe({ switchable: true });
    expectTheme("dark");
    act(() => window.history.replaceState(null, "", "/ask?company=stripe#note"));
    expectTheme("dark");
    act(() => window.history.pushState(null, "", "/explore/?q=stripe#jobs"));
    expectTheme("dark");
  });

  it("updates html before passive effects on mount, pushState, replaceState and back navigation", async () => {
    localStorage.setItem("sw-theme", "dark");
    const observe = vi.fn<(value: string) => void>();
    render(<ThemeProvider switchable><Probe observe={observe} /></ThemeProvider>);
    expect(observe.mock.calls).toEqual([["dark:true"]]);
    act(() => window.history.pushState(null, "", "/plans"));
    expectTheme("light", false);
    act(() => window.history.pushState(null, "", "/ask"));
    expectTheme("dark");
    await act(async () => {
      const popped = new Promise<void>(resolve => window.addEventListener("popstate", () => resolve(), { once: true }));
      window.history.back();
      await popped;
    });
    expectTheme("light", false);
    act(() => window.history.replaceState(null, "", "/requests"));
    expectTheme("dark");
    expect(observe.mock.calls).toEqual([
      ["dark:true"], ["light:false"], ["dark:true"], ["light:false"], ["dark:true"],
    ]);
    expect(localStorage.getItem("sw-theme")).toBe("dark");
  });

  it("retains the saved choice when mounted off-route and when switching is disabled", () => {
    window.history.replaceState(null, "", "/wallet");
    localStorage.setItem("sw-theme", "dark");
    const view = renderProbe({ switchable: true });
    expectTheme("light", false);
    act(() => window.history.pushState(null, "", "/explore"));
    expectTheme("dark");
    view.rerender(<ThemeProvider switchable={false}><Probe /></ThemeProvider>);
    expectTheme("light", false);
    view.rerender(<ThemeProvider switchable><Probe /></ThemeProvider>);
    expectTheme("dark");
    expect(localStorage.getItem("sw-theme")).toBe("dark");
  });

  it("keeps dark on html so goal portals outside the React root inherit it", () => {
    localStorage.setItem("sw-theme", "dark");
    const view = render(<ThemeProvider switchable><Probe />{createPortal(
      <div className="g-scope" data-testid="goal-portal">Portal</div>, document.body,
    )}</ThemeProvider>);
    const portal = screen.getByTestId("goal-portal");
    expect(view.container.contains(portal)).toBe(false);
    expect(portal.closest("html.dark")).toBe(document.documentElement);
    expect(view.container.querySelector(".dark")).toBeNull();
    act(() => window.history.pushState(null, "", "/explore/stripe"));
    expect(portal.closest(".dark")).toBeNull();
  });

  it("suppresses transitions only while a changed theme is committed, then restores them", () => {
    renderProbe({ switchable: true });
    const root = document.documentElement;
    const toggle = root.classList.toggle.bind(root.classList);
    const changes: boolean[] = [];
    vi.spyOn(root.classList, "toggle").mockImplementation((token, force) => {
      if (token === "dark") {
        expect(root.classList.contains("g-theme-switching")).toBe(true);
        changes.push(force === true);
      }
      return force === undefined ? toggle(token) : toggle(token, force);
    });
    const flush = vi.spyOn(root, "offsetHeight", "get").mockImplementation(() => {
      expect(root.classList.contains("g-theme-switching")).toBe(true);
      return 0;
    });
    fireEvent.click(screen.getByRole("button"));
    expectTheme("dark");
    expect(root.classList.contains("g-theme-switching")).toBe(false);
    act(() => window.history.pushState(null, "", "/requests"));
    expect(changes).toEqual([true]);
    fireEvent.click(screen.getByRole("button"));
    expectTheme("light");
    expect(changes).toEqual([true, false]);
    expect(flush).toHaveBeenCalledTimes(2);
    expect(root.classList.contains("g-theme-switching")).toBe(false);
  });
});
