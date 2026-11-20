// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as LanguageRegistry from "../../../shared/languages";

const fixture = vi.hoisted(() => ({ languages: null as LanguageRegistry.LanguageEntry[] | null, loaded: true, signedIn: true, go: vi.fn() }));
vi.mock("@shared/languages", async importOriginal => {
  const actual = await importOriginal<typeof LanguageRegistry>();
  const languages = () => fixture.languages ?? actual.visibleLanguages();
  return { ...actual, visibleLanguages: languages, isVisibleLanguage: (code: unknown) => languages().some(language => language.code === code) };
});
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: fixture.loaded, isSignedIn: fixture.signedIn, signOut: vi.fn(), getToken: async () => null }),
  useUser: () => ({ user: null }),
}));
vi.mock("wouter", () => ({ useLocation: () => ["/requests", fixture.go] }));
vi.mock("@/components/NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "unverified" }) }));

import { AccountMenu } from "./AccountMenu";
import { setLanguage } from "@/lib/i18n";

const twoLanguages: LanguageRegistry.LanguageEntry[] = [
  { code: "en", endonym: "English", script: "Latn", dir: "ltr", reviewed: true },
  { code: "hi", endonym: "हिन्दी", script: "Deva", dir: "ltr", reviewed: true },
];
const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
const openMenu = async () => {
  fireEvent.pointerDown(screen.getByRole("button", { name: "Account menu" }), { button: 0, ctrlKey: false });
  await screen.findByRole("menuitem", { name: "Settings" });
};

beforeEach(() => {
  fixture.languages = null;
  fixture.loaded = true;
  fixture.signedIn = true;
  fixture.go.mockReset();
  setLanguage("en", { persistLocal: false });
  localStorage.clear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("account-menu language choice", () => {
  it("adds no Language entry for the actual English-only registry", async () => {
    render(<AccountMenu />);
    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Language" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Language" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([{ loaded: false, signedIn: false }, { loaded: true, signedIn: false }])("keeps private menu controls absent for auth state %j", state => {
    fixture.languages = twoLanguages;
    Object.assign(fixture, state);
    render(<AccountMenu />);
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Language" })).toBeNull();
  });

  it("opens the real endonym picker and persists the choice without navigation", async () => {
    fixture.languages = twoLanguages;
    render(<AccountMenu />);
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Language" }));
    const picker = await screen.findByRole("combobox", { name: "Language" });
    expect(within(picker).getAllByRole("option").map(option => [option.textContent, option.getAttribute("lang")])).toEqual([["English", "en"], ["हिन्दी", "hi"]]);
    await waitFor(() => expect(document.activeElement).toBe(picker));
    fireEvent.change(picker, { target: { value: "hi" } });
    expect(localStorage.getItem("sw:language")).toBe("hi");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/account/preferences", expect.objectContaining({ method: "PUT", credentials: "include", body: JSON.stringify({ language: "hi" }) })));
    expect(fixture.go).not.toHaveBeenCalled();
  });

  it("Escape closes the picker and restores account-trigger focus without saving", async () => {
    fixture.languages = twoLanguages;
    render(<AccountMenu />);
    const trigger = screen.getByRole("button", { name: "Account menu" });
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Language" }));
    const picker = await screen.findByRole("combobox", { name: "Language" });
    fireEvent.keyDown(picker, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("combobox", { name: "Language" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fixture.go).not.toHaveBeenCalled();
  });
});
