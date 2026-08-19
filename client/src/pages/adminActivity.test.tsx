// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminActivity from "./AdminActivity";

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: true, getToken: vi.fn().mockResolvedValue("admin-token") }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));

describe("administrator activity viewer", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ events: [{ id: 7, action: "document.uploaded", outcome: "success", resourceType: "attachment", resourceId: "4", companyDomain: "acme.com", metadata: '{"mimeType":"application/pdf","fileSize":1024}', createdAt: "2026-08-14T00:00:00.000Z", actorName: "Avery", actorEmail: "avery@example.com" }] }) })));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("renders minimized operational metadata and filters administrator diagnostic events", async () => {
    render(<AdminActivity />);
    await waitFor(() => expect(screen.getByText("document.uploaded")).toBeTruthy());
    expect(screen.getByText(/No document contents or names, target URLs, OTPs/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search activity"), { target: { value: "document" } });
    fireEvent.change(screen.getByLabelText("Filter activity by outcome"), { target: { value: "success" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("query=document") && String(url).includes("outcome=success"))).toBe(true));
  });
});
