// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacyPanels } from "../components/settings/PrivacyPanels";

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, getToken: vi.fn().mockResolvedValue("t") }) }));
vi.mock("../components/settings/BlockedPeople", () => ({ default: () => null }));
vi.mock("../components/settings/TalentConsentPanel", () => ({ TalentConsentPanel: () => null }));

let latest: unknown = { export: null };
let posts = 0;
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, headers: new Headers({ "content-type": "application/json" }), json: async () => body, text: async () => JSON.stringify(body) });

beforeEach(() => {
  posts = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/privacy/export-requests" && init?.method === "POST") { posts += 1; return reply(201, { id: 3 }); }
    if (url === "/api/privacy/export-requests/latest") return reply(200, latest);
    return reply(404, {});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderPanel = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><PrivacyPanels getToken={async () => "t"} /></QueryClientProvider>);

describe("Download your data (async)", () => {
  it("offers a request when nothing exists and posts once", async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Request my data" }));
    await waitFor(() => expect(posts).toBe(1));
  });
  it("shows preparing with no second request button while a request is pending", async () => {
    latest = { export: { id: 3, status: "requested", byteSize: 0 } };
    renderPanel();
    expect(await screen.findByText(/Preparing your export/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Request my data" })).toBeNull();
  });
  it("offers the download once ready and shows the size", async () => {
    latest = { export: { id: 3, status: "ready", byteSize: 2048, expiresAt: "2026-10-22T00:00:00.000Z", fileName: "x.zip" } };
    renderPanel();
    expect(await screen.findByRole("button", { name: "Download my data" })).toBeTruthy();
    expect(screen.getByText(/2 KB/)).toBeTruthy();
  });
  it("lets the user ask again after a failure", async () => {
    latest = { export: { id: 3, status: "failed", byteSize: 0 } };
    renderPanel();
    expect(await screen.findByText(/could not be prepared/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Request my data" })).toBeTruthy();
  });
});
