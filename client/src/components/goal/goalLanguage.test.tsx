// @vitest-environment jsdom
// D-093.picker (packet §5.4): the endonym picker and the one-time consent line. Only English is reviewed today,
// so both components are invisible in production by design; these tests fix that behaviour with a two-language
// fixture and pin the rules that matter: endonyms carry their own `lang`, no flags, 44px targets, and the consent
// line never navigates.
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TWO = [
  { code: "en", endonym: "English", script: "Latn", dir: "ltr", reviewed: true },
  { code: "hi", endonym: "हिन्दी", script: "Deva", dir: "ltr", reviewed: true },
] as const;

const visible = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock("@shared/languages", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../../shared/languages")>();
  const current = () => (visible.list.length ? (visible.list as typeof actual.LANGUAGES) : actual.visibleLanguages());
  return {
    ...actual,
    visibleLanguages: current,
    // The fixture language must read as reviewed everywhere, including the store's own visibility check.
    isVisibleLanguage: (code: unknown) => current().some(entry => entry.code === code),
  };
});
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: false, getToken: async () => null }) }));

import { GoalLanguagePicker } from "./GoalLanguagePicker";
import { GoalLanguageConsent, LANGUAGE_CONSENT_STORAGE_KEY } from "./GoalLanguageConsent";
import { setLanguage } from "@/lib/i18n";

beforeEach(() => { visible.list = []; setLanguage("en", { persistLocal: false }); try { localStorage.clear(); } catch { /* ignore */ } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("GoalLanguagePicker (D-093.picker)", () => {
  it("renders nothing while English is the only visible language", () => {
    const { container } = render(<GoalLanguagePicker />);
    expect(container.innerHTML).toBe("");
  });

  it("lists endonyms with their own lang attribute, and no flags or images", () => {
    visible.list = [...TWO];
    const { container } = render(<GoalLanguagePicker variant="settings" />);
    const options = Array.from(container.querySelectorAll("option"));
    expect(options.map(option => option.textContent)).toEqual(["English", "हिन्दी"]);
    expect(options.map(option => option.getAttribute("lang"))).toEqual(["en", "hi"]);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent ?? "").not.toMatch(/[\uD83C][\uDDE6-\uDDFF]/);
  });

  it("has a 44px-minimum control for phone targets", () => {
    visible.list = [...TWO];
    const { container } = render(<GoalLanguagePicker />);
    expect(container.querySelector("select")?.className ?? "").toMatch(/min-h-11/);
  });

  it("switching language stores the device choice", () => {
    visible.list = [...TWO];
    const { container } = render(<GoalLanguagePicker />);
    const select = container.querySelector("select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "hi" } });
    expect(localStorage.getItem("sw:language")).toBe("hi");
  });
});

describe("GoalLanguageConsent (D-093.picker)", () => {
  it("shows once for a visible device language that differs from the active one", () => {
    visible.list = [...TWO];
    render(<GoalLanguageConsent deviceLanguages={["hi-IN", "en"]} />);
    expect(screen.getByRole("region", { name: "Language suggestion" })).toBeTruthy();
    expect(screen.getByText(/Use skipwait\.me in/)).toBeTruthy();
  });

  it("does not show when the device language is the active one or not visible", () => {
    visible.list = [...TWO];
    render(<GoalLanguageConsent deviceLanguages={["en-GB"]} />);
    expect(screen.queryByRole("region", { name: "Language suggestion" })).toBeNull();
    cleanup();
    render(<GoalLanguageConsent deviceLanguages={["fr-FR"]} />);
    expect(screen.queryByRole("region", { name: "Language suggestion" })).toBeNull();
  });

  it("dismissing stores the decision, never navigates, and the line stays gone", () => {
    visible.list = [...TWO];
    const before = window.location.href;
    render(<GoalLanguageConsent deviceLanguages={["hi-IN"]} />);
    fireEvent.click(screen.getByRole("button", { name: /Keep English/ }));
    expect(localStorage.getItem(LANGUAGE_CONSENT_STORAGE_KEY)).toBe("1");
    expect(window.location.href).toBe(before);
    cleanup();
    render(<GoalLanguageConsent deviceLanguages={["hi-IN"]} />);
    expect(screen.queryByRole("region", { name: "Language suggestion" })).toBeNull();
  });
});
