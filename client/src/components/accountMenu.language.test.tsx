// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "@/lib/i18n";
import type { LanguageEntry } from "@shared/languages";
import { AccountMenu } from "./AccountMenu";

const { auth, fixture } = vi.hoisted(() => ({
  auth: { signedIn: true, getToken: vi.fn(async () => null) },
  fixture: { languages: null as readonly LanguageEntry[] | null },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: auth.signedIn, getToken: auth.getToken, signOut: vi.fn() }),
  useUser: () => ({ user: null }),
}));
vi.mock("@/components/NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "unverified" }) }));
vi.mock("@shared/languages", async importOriginal => {
  const actual = await importOriginal<typeof import("@shared/languages")>();
  const visibleLanguages = () => fixture.languages ?? actual.visibleLanguages();
  return { ...actual, visibleLanguages, isVisibleLanguage: (code: string) => visibleLanguages().some(entry => entry.code === code) };
});

const TWO_LANGUAGES: readonly LanguageEntry[] = [
  { code: "en", endonym: "English", script: "Latn", dir: "ltr", reviewed: true },
  { code: "hi", endonym: "हिन्दी", script: "Deva", dir: "ltr", reviewed: true },
];
const fetchMock = vi.fn(async () => ({ ok: true }));

function openMenu() {
  const trigger = screen.getByRole("button", { name: "Account menu" });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  return trigger;
}

function openLanguagePicker() {
  openMenu();
  const entry = screen.getByRole("menuitem", { name: "Language" });
  entry.focus();
  fireEvent.keyDown(entry, { key: "Enter" });
  return screen.getByRole("dialog", { name: "Language" });
}

beforeEach(() => {
  fixture.languages = null;
  auth.signedIn = true;
  localStorage.clear();
  setLanguage("en", { persistLocal: false });
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("AccountMenu language entry (D-093.menu)", () => {
  it("does not mount for a signed-out visitor, even when multiple languages are visible", () => {
    auth.signedIn = false;
    fixture.languages = TWO_LANGUAGES;
    render(<AccountMenu />);
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("omits Language with today's reviewed catalogue and leaves Settings available", () => {
    render(<AccountMenu />);
    openMenu();
    expect(screen.getByRole("menuitem", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Language" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens the existing picker from the keyboard, with endonyms and no navigation", async () => {
    fixture.languages = TWO_LANGUAGES;
    render(<AccountMenu />);
    const route = window.location.href;
    const dialog = openLanguagePicker();
    const picker = within(dialog).getByRole("combobox", { name: "Language" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(picker);
    expect(within(picker).getAllByRole("option").map(option => [option.textContent, option.getAttribute("lang")]))
      .toEqual([["English", "en"], ["हिन्दी", "hi"]]);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(picker, { target: { value: "hi" } });
    expect(localStorage.getItem("sw:language")).toBe("hi");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/account/preferences", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: "hi" }),
    }));
    expect(window.location.href).toBe(route);
  });

  it("dismisses with Escape and returns focus to the account trigger", async () => {
    fixture.languages = TWO_LANGUAGES;
    render(<AccountMenu />);
    const trigger = screen.getByRole("button", { name: "Account menu" });
    const dialog = openLanguagePicker();
    fireEvent.keyDown(within(dialog).getByRole("combobox"), { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
