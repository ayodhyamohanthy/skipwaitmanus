// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReferrerFastTrackCard } from "./ReferrerFastTrackCard";

const { getToken, toast } = vi.hoisted(() => ({ getToken: vi.fn().mockResolvedValue("test-token"), toast: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, getToken }) }));
vi.mock("sonner", () => ({ toast }));

const link = { linkCode: "abc123", vanityAlias: "ref-priya", companyDomain: "acme.com", isActive: true, url: "https://skipwait.me/fast/abc123", vanityUrl: "https://skipwait.me/refer/acme/ref-priya", suggestedBioCopy: "Private referral requests at acme.com via Skipwait.me." };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); toast.mockReset(); });

describe("Referrer Fast-Track Link card", () => {
  it("pauses the link only after an explicit confirmation and then offers a fresh link", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/referrer-fast-track/me/deactivate" && init?.method === "POST") return { ok: true, json: async () => ({ deactivated: true }) };
      return { ok: true, json: async () => ({ link }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ReferrerFastTrackCard />);
    expect(await screen.findByText("skipwait.me/refer/acme/ref-priya")).toBeTruthy();
    expect(document.querySelector('[data-skipwait-fast-track-state="active"]')).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Pause link" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/deactivate"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Keep it live" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/deactivate"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Pause link" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(dialog.querySelector("button:last-of-type") as HTMLButtonElement);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/referrer-fast-track/me/deactivate", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(document.querySelector('[data-skipwait-fast-track-state="paused"]')).toBeTruthy());
    expect(screen.getByRole("button", { name: "Create a new link" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Create a new link" }));
    await waitFor(() => expect(document.querySelector('[data-skipwait-fast-track-state="active"]')).toBeTruthy());
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/referrer-fast-track/me").length).toBe(2);
  });

  it("keeps the link live and offers Try again when pausing fails", async () => {
    let attempt = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/deactivate") && init?.method === "POST") { attempt += 1; return attempt === 1 ? { ok: false, status: 500, json: async () => ({ error: "We could not pause your Fast-Track Link" }) } : { ok: true, json: async () => ({ deactivated: true }) }; }
      return { ok: true, json: async () => ({ link }) };
    }));
    render(<ReferrerFastTrackCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Pause link" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(dialog.querySelector("button:last-of-type") as HTMLButtonElement);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("That didn’t go through");
    expect(alert.textContent).toContain("Your link is unchanged.");
    expect(document.querySelector('[data-skipwait-fast-track-state="error"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(document.querySelector('[data-skipwait-fast-track-state="paused"]')).toBeTruthy());
  });

  it("shows an inline error with retry instead of a toast when the link cannot be created", async () => {
    let attempt = 0;
    vi.stubGlobal("fetch", vi.fn(async () => { attempt += 1; return attempt === 1 ? { ok: false, status: 503, json: async () => ({ error: "Fast-Track Links are unavailable right now" }) } : { ok: true, json: async () => ({ link }) }; }));
    render(<ReferrerFastTrackCard />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Fast-Track Links are unavailable right now");
    expect(toast).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("skipwait.me/refer/acme/ref-priya")).toBeTruthy();
  });
});
