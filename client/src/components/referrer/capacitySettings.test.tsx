// @vitest-environment jsdom
// Referrer workspace "Setup & capacity" tab: live company + preferences,
// honest signed-out gate, real PUT save, and error/retry without fake success.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CapacitySettingsPanel } from "./CapacitySettingsPanel";
import { orderAreas } from "./capacitySettingsData";

type Reply = { ok: boolean; status?: number; json: () => Promise<unknown> };
const ok = (body: unknown): Reply => ({ ok: true, json: async () => body });
const preferences = (overrides: Record<string, unknown> = {}) => ({ preferences: { referralCapacity: 3, preferAreas: ["Design"], preferLevels: [], referrerVisibility: "anon", notifyNewAsk: true, notifyDigest: false, paused: false, ...overrides } });

function renderPanel(props: Partial<React.ComponentProps<typeof CapacitySettingsPanel>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSignIn = vi.fn();
  render(<QueryClientProvider client={client}><CapacitySettingsPanel isSignedIn getToken={async () => "test-token"} onSignIn={onSignIn} {...props} /></QueryClientProvider>);
  return { onSignIn };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Referrer setup & capacity", () => {
  it("asks signed-out visitors to verify a company email instead of showing preview controls", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { onSignIn } = renderPanel({ isSignedIn: false });
    expect(screen.getByText("Protect your time.")).toBeTruthy();
    expect(screen.queryByText(/PREVIEW ONLY/)).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Use company email/ }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the verified company and saved preferences, then saves through the real preferences contract", async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit): Promise<Reply> => {
      const url = String(input);
      if (url === "/api/company-referrals/access") return ok({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" });
      if (url === "/api/referrer-preferences" && init?.method === "PUT") return ok(preferences(JSON.parse(String(init.body)) as Record<string, unknown>));
      if (url === "/api/referrer-preferences") return ok(preferences({ preferAreas: ["Design", "Data"] }));
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel();
    expect(await screen.findByText("acme.com")).toBeTruthy();
    expect(screen.getByText("Verified work email")).toBeTruthy();
    const select = screen.getByRole("combobox", { name: "Work function" }) as HTMLSelectElement;
    expect(select.value).toBe("Design");
    fireEvent.change(select, { target: { value: "Data" } });
    fireEvent.change(screen.getByRole("slider"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Pause new requests/ }));
    fireEvent.click(screen.getByRole("button", { name: /Save settings/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("SETTINGS SAVED · NEW REQUESTS PAUSED"));
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ preferAreas: ["Data", "Design"], referralCapacity: 5, paused: true });
  });

  it("surfaces a save failure without claiming the settings were saved", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit): Promise<Reply> => {
      const url = String(input);
      if (url === "/api/company-referrals/access") return ok({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" });
      if (init?.method === "PUT") return { ok: false, status: 400, json: async () => ({ error: "Capacity is 1 to 15 asks" }) };
      return ok(preferences());
    }));
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /Save settings/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("Capacity is 1 to 15 asks");
    expect(screen.getByRole("status").textContent).not.toContain("SETTINGS SAVED");
  });

  it("offers a retry when the settings cannot load, and links unverified referrers to verification", async () => {
    let fail = true;
    vi.stubGlobal("fetch", vi.fn(async (input: string): Promise<Reply> => {
      const url = String(input);
      if (url === "/api/company-referrals/access") return ok({ verifiedCompanyAccess: false, workEmailDomain: null });
      if (fail) return { ok: false, status: 500, json: async () => ({ error: "We could not load your referrer settings" }) };
      return ok(preferences({ preferAreas: [] }));
    }));
    renderPanel();
    expect(await screen.findByText("We couldn’t load your settings")).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("No verified work email yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Verify work email" }).getAttribute("href")).toBe("/verify");
  });

  it("keeps every saved area and moves the chosen function to the front", () => {
    expect(orderAreas("Data", ["Design", "Data", "Unknown"])).toEqual(["Data", "Design"]);
    expect(orderAreas("", ["Design", "Unknown"])).toEqual(["Design"]);
  });
});
