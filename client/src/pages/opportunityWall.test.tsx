// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpportunityWall from "./OpportunityWall";

vi.mock("sonner", () => ({ toast: vi.fn() }));

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Opportunity Wall", () => {
  it("shows anonymous company opportunities and saves a role-url draft before the Job Seeker signs in", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ opportunities: [{ id: 1, companyDomain: "acme.com", kind: "hiring_now", roleTitle: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", location: "Remote", compensation: "₹12–18 LPA", walkInAt: null, walkInEndsAt: null, createdAt: "2026-08-14" }] }) })));
    render(<OpportunityWall />);
    await waitFor(() => expect(screen.getByText("Product Designer")).toBeTruthy());
    expect(screen.getByText("acme.com")).toBeTruthy();
    expect(screen.getByText("Compensation: ₹12–18 LPA")).toBeTruthy();
    expect(screen.queryByText("employee@acme.com")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use this opportunity" }));
    expect(localStorage.getItem("bridge-target-url")).toBe("https://careers.acme.com/jobs/design");
    expect(localStorage.getItem("bridge-target-compensation")).toBe("₹12–18 LPA");
    expect(JSON.parse(localStorage.getItem("skipwait-pwa-referral-draft") || "{}").targetUrl).toBe("https://careers.acme.com/jobs/design");
  });

  it("shows the poster's chosen first name on a named post and keeps Identity hidden on an anonymous one", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => String(url).includes("/api/companies") || String(url).includes("/api/partners") ? { companies: [], modules: [] } : { opportunities: [
      { id: 1, companyDomain: "acme.com", kind: "hiring_now", roleTitle: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", location: null, compensation: null, walkInAt: null, walkInEndsAt: null, createdAt: "2026-10-01T00:00:00.000Z", poster: { kind: "firstName", firstName: "Ravi" } },
      { id: 2, companyDomain: "merkle.com", kind: "hiring_now", roleTitle: "Data Analyst", targetRoleUrl: "https://merkle.com/jobs/1", location: null, compensation: null, walkInAt: null, walkInEndsAt: null, createdAt: "2026-10-02T00:00:00.000Z", poster: { kind: "anonymous" } },
    ] } })));
    render(<OpportunityWall />);
    await waitFor(() => expect(screen.getByText("Product Designer")).toBeTruthy());
    expect(screen.getByText("Posted by Ravi")).toBeTruthy();
    expect(screen.queryByText("Identity hidden")).toBeNull();
    expect(screen.getByText("A verified employee shared this company signal with their first name shown.")).toBeTruthy();
    expect(screen.queryByText(/without exposing their identity/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("Data Analyst")).toBeTruthy());
    expect(screen.getByText("Identity hidden")).toBeTruthy();
    expect(screen.queryByText(/Posted by/)).toBeNull();
    expect(screen.getByText("A verified employee shared this company signal without exposing their identity.")).toBeTruthy();
    expect(screen.queryByText(/with their first name shown/)).toBeNull();
  });

  it("marks the poster as a verified employee, links the directory company, and offers posting", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => String(url).includes("/api/companies") ? { companies: [{ slug: "acme", name: "Acme", domains: ["acme.com"] }] } : { opportunities: [{ id: 1, companyDomain: "acme.com", kind: "hiring_now", roleTitle: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", location: null, compensation: null, walkInAt: null, walkInEndsAt: null, createdAt: "2026-10-01T00:00:00.000Z" }] } })));
    render(<OpportunityWall />);
    await waitFor(() => expect(screen.getByText("Product Designer")).toBeTruthy());
    expect(screen.getByText(/Verified employee at/)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("link", { name: "Acme" }).getAttribute("href")).toBe("/explore/acme"));
    expect(screen.getByRole("link", { name: /Share an opening you can refer for/ }).getAttribute("href")).toBe("/post-opportunity");
    expect(screen.queryByText(/@/)).toBeNull();
  });

  it("offers direct opening shares without exposing a Referrer or candidate", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ opportunities: [{ id: 1, companyDomain: "acme.com", kind: "hiring_now", roleTitle: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", location: "Remote", walkInAt: null, walkInEndsAt: null, createdAt: "2026-08-14" }] }) })));
    render(<OpportunityWall />);
    await waitFor(() => expect(screen.getByText("Product Designer")).toBeTruthy());
    expect(screen.queryByText(/^Compensation:/)).toBeNull();
    const whatsApp = screen.getByRole("link", { name: "Share on WhatsApp" }).getAttribute("href") || "";
    const email = screen.getByRole("link", { name: "Share by email" }).getAttribute("href") || "";
    expect(whatsApp).toContain("wa.me/?text="); expect(whatsApp).toContain(encodeURIComponent("Product Designer"));
    expect(email).toContain("mailto:"); expect(email).toContain(encodeURIComponent("acme.com"));
    expect(screen.getByRole("link", { name: "Share on LinkedIn" }).getAttribute("href")).toContain("linkedin.com/sharing");
    expect(screen.getByRole("link", { name: "Share on X" }).getAttribute("href")).toContain("x.com/intent/post");
    expect(whatsApp).not.toContain("employee%40");
  });

  it("labels a paid placement as a featured listing and keeps it after employee posts", async () => {
    const opening = (overrides: Record<string, unknown>) => ({ id: 1, companyDomain: "acme.com", kind: "hiring_now", roleTitle: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", location: "Remote", walkInAt: null, walkInEndsAt: null, createdAt: "2026-08-14", isSponsored: false, ...overrides });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/api/partners") || String(url).includes("/api/companies")) return { ok: true, json: async () => ({ modules: [], companies: [] }) };
      return { ok: true, json: async () => ({ opportunities: [opening({}), opening({ id: 2, companyDomain: "merkle.com", roleTitle: "Data Analyst", isSponsored: true })] }) };
    }));
    render(<OpportunityWall />);
    await waitFor(() => expect(screen.getByText("Product Designer")).toBeTruthy());
    expect(screen.getByText(/Employee-shared opening/)).toBeTruthy();
    expect(screen.queryByText("Featured listing")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("Data Analyst")).toBeTruthy());
    expect(screen.getByText(/Featured listing · paid placement/)).toBeTruthy();
    expect(screen.getByText("Featured listing")).toBeTruthy();
  });

  it("uses a visual no-opening state with one share action when no internal openings are live", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ opportunities: [] }) })));
    render(<OpportunityWall />);
    await waitFor(() => expect(document.querySelector('[aria-label="No internal openings"]')).toBeTruthy());
    expect(document.querySelector('[data-skipwait-zero-action="job_seeker"]')).toBeTruthy();
    expect(screen.queryByText("No openings yet.")).toBeNull();
    expect(screen.getByRole("button", { name: "Request a referral" })).toBeTruthy();
  });

  it("shows a readable recovery state when an API edge returns HTML instead of JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => { throw new SyntaxError("Unexpected token '<'"); } })));
    render(<OpportunityWall />);
    expect((await screen.findByRole("alert")).textContent).toContain("Internal openings are temporarily unavailable. Please try again.");
    expect(screen.queryByText(/Unexpected token/i)).toBeNull();
  });

  it("recovers through Try again when the openings request fails first", async () => {
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/api/partners") || String(url).includes("/api/companies")) return { ok: true, json: async () => ({ modules: [], companies: [] }) };
      attempts += 1;
      return attempts === 1 ? { ok: false, status: 503, json: async () => ({ error: "Internal openings are temporarily unavailable. Please try again." }) } : { ok: true, json: async () => ({ opportunities: [{ id: 1, companyDomain: "acme.com", kind: "hiring_now", roleTitle: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", location: "Remote", compensation: null, walkInAt: null, walkInEndsAt: null, createdAt: "2026-08-14" }] }) };
    }));
    render(<OpportunityWall />);
    expect((await screen.findByRole("alert")).textContent).toContain("temporarily unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Product Designer")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(attempts).toBe(2);
  });
});
