// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Explore from "./Explore";
import ExploreCompany from "./ExploreCompany";

const { go } = vi.hoisted(() => ({ go: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }), SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/explore", go],
  useRoute: () => [true, { slug: "wipro" }],
}));

const JOBS = [
  { id: 1, title: "Product Designer", company: "Wipro", location: "Bengaluru", seniority: "Mid-level", workMode: "Hybrid", targetRoleUrl: "https://careers.wipro.com/jobs/1" },
  { id: 2, title: "Data Analyst", company: "wipro.com", location: "Remote", seniority: "Early career", workMode: "Remote", targetRoleUrl: "https://careers.wipro.com/jobs/2" },
  { id: 3, title: "UX Researcher", company: "TCS", location: "Global", seniority: "Senior", workMode: "On-site", targetRoleUrl: "https://tcs.com/jobs/3" },
];

beforeEach(() => { go.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Explore directory", () => {
  it("lists launch companies with real open-role counts, never invented people", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ jobs: JOBS }) })));
    render(<Explore />);
    expect(await screen.findByText("Wipro")).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/2 open/)).toBeTruthy());
    expect(screen.getByText("TCS")).toBeTruthy();
    expect(screen.queryByText(/people open/i)).toBeNull();
    expect(screen.getByText("SkipWait")).toBeTruthy();
  });

  it("filters by search text without fabricating results", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ jobs: JOBS }) })));
    render(<Explore />);
    await screen.findByText("Wipro");
    fireEvent.change(screen.getByLabelText("Search companies"), { target: { value: "tcs" } });
    expect(screen.getByText("TCS")).toBeTruthy();
    expect(screen.queryByText("Wipro")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search companies"), { target: { value: "zzz-no-such-company" } });
    expect(screen.getByText("No matching doors yet")).toBeTruthy();
  });

  it("renders even when the jobs backend is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    render(<Explore />);
    expect(await screen.findByText("5 companies to explore")).toBeTruthy();
  });
});

describe("Explore company detail", () => {
  it("shows real roles with save toggles backed by the saved-roles endpoint", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/saved-roles") && !String(url).match(/\/\d+$/)) return { ok: true, json: async () => ({ saved: [] }) };
      if (String(url).match(/\/saved-roles\/\d+$/)) return { ok: true, json: async () => ({ saved: true }) };
      return { ok: true, json: async () => ({ jobs: JOBS }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ExploreCompany />);
    await waitFor(() => expect(screen.getAllByText(/2 open/).length).toBe(2));
    expect(screen.getByText("Product Designer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save Product Designer" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/saved-roles/1", expect.objectContaining({ method: "PUT" })));
    expect(await screen.findByRole("button", { name: "Unsave Product Designer" })).toBeTruthy();
  });

  it("stays honest when a company has no listed roles", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ jobs: [] }) })));
    render(<ExploreCompany />);
    expect(await screen.findByText("No listed roles right now")).toBeTruthy();
    expect(screen.getByText(/still ask with any job link/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Ask for a referral/ }).getAttribute("href")).toBe("/ask");
  });
});
