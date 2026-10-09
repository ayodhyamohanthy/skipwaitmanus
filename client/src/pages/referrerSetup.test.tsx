// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReferrerSetup from "./ReferrerSetup";

const { authState, go } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/referrer-setup", go],
}));

beforeEach(() => { authState.isSignedIn = true; go.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (json: unknown) => ({ ok: true, json: async () => json });

function stubSetup() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).endsWith("/access")) return ok({ verifiedCompanyAccess: true, workEmailDomain: "wipro.com" });
    if (String(url).endsWith("/referrer-preferences")) return ok({ preferences: { preferAreas: [], referralCapacity: 3, referrerVisibility: "anon", notifyNewAsk: true } });
    return ok({});
  }));
}

describe("ReferrerSetup", () => {
  it("gates setup behind verification without inventing state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ verifiedCompanyAccess: false, workEmailDomain: null })));
    render(<ReferrerSetup />);
    expect(await screen.findByText("Verify first.")).toBeTruthy();
    expect(screen.queryByText("Which roles can you judge?")).toBeNull();
  });

  it("walks areas to ready and persists real preferences", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/access")) return ok({ verifiedCompanyAccess: true, workEmailDomain: "wipro.com" });
      if (String(url).endsWith("/referrer-preferences") && init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        expect(body).toMatchObject({ referralCapacity: 5, referrerVisibility: "named" });
        expect(body.preferAreas).toEqual(["Design", "Product"]);
        expect(body.preferLevels).toEqual(["Mid-level", "Senior"]);
        return ok({ preferences: body });
      }
      if (String(url).endsWith("/referrer-preferences")) return ok({ preferences: { preferAreas: [], referralCapacity: 3, referrerVisibility: "anon", notifyNewAsk: true } });
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ReferrerSetup />);
    expect(await screen.findByText("Which roles can you judge?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Design" }));
    fireEvent.click(screen.getByRole("button", { name: "Product" }));
    fireEvent.click(screen.getByRole("button", { name: "Mid-level" }));
    fireEvent.click(screen.getByRole("button", { name: "Senior" }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    const slider = screen.getByLabelText("Monthly capacity") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Named on company pages/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("button", { name: /Finish/ }));
    expect(await screen.findByText("You're open for asks.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/referrer-preferences", expect.objectContaining({ method: "PUT" }));
  });

  it("requires at least one area before continuing", async () => {
    stubSetup();
    render(<ReferrerSetup />);
    expect(await screen.findByText("Which roles can you judge?")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue/ }).hasAttribute("disabled")).toBe(true);
  });
});
