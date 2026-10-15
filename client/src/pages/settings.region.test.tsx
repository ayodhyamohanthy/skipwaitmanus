// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Settings from "./Settings";
import { getDisplayPrefs, setDisplayPrefs } from "@/lib/displayPrefs";

let signedIn = true;
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: signedIn, isLoaded: true, getToken: vi.fn().mockResolvedValue("token") }),
  useUser: () => ({ user: { emailAddresses: [] }, isSignedIn: signedIn }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  SignedIn: ({ children }: { children: React.ReactNode }) => children,
  SignedOut: () => null,
}));

const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Settings /></QueryClientProvider>);

describe("Settings > Region display preferences", () => {
  beforeEach(() => { window.history.replaceState({}, "", "/settings?section=region"); setDisplayPrefs({ timeZone: null, dateFormat: null }); localStorage.clear(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

  it("signed in: saves only the changed field to the account", { timeout: 15000 }, async () => {
    signedIn = true;
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    mount();
    await user.selectOptions(screen.getByLabelText("Date format"), "iso");
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/account/preferences");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ dateFormat: "iso" });
    expect(getDisplayPrefs().dateFormat).toBe("iso");
  });

  it("signed in: a failed save reverts and says so", async () => {
    signedIn = true;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    const user = userEvent.setup();
    mount();
    await user.selectOptions(screen.getByLabelText("Date format"), "dmy");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/could not save/i));
    expect(getDisplayPrefs().dateFormat).toBeNull();
  });

  it("guest: keeps the choice on this device and calls no API", async () => {
    signedIn = false;
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    mount();
    await user.selectOptions(screen.getByLabelText("Date format"), "mdy");
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("sw:display-prefs") ?? "{}").dateFormat).toBe("mdy");
  });
});
