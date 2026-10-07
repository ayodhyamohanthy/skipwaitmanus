// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Explore directory", () => {
  it("renders the kit directory with availability pills and door links", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ jobs: JOBS }) })));
    render(<Explore />);
    expect(await screen.findByText("5 companies to explore")).toBeTruthy();
    expect(screen.getAllByText("People open to referrals")).toHaveLength(5);
    const doors = screen.getAllByRole("link", { name: /View open door/ });
    expect(doors).toHaveLength(5);
    expect(doors[0].getAttribute("href")).toBe("/explore/skipwait");
    expect(screen.queryByText(/open roles/)).toBeNull();
  });

  it("filters by search text without fabricating results", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ jobs: JOBS }) })));
    render(<Explore />);
    await screen.findByText("5 companies to explore");
    fireEvent.change(screen.getByLabelText("Search companies"), { target: { value: "tcs" } });
    await waitFor(() => expect(screen.getByText("1 company to explore")).toBeTruthy());
    expect(screen.queryByText("Wipro")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search companies"), { target: { value: "zzz-no-such-company" } });
    expect(await screen.findByText("No matching doors yet")).toBeTruthy();
  });

  it("links the employee band and invite flow to live destinations", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ jobs: [] }) })));
    render(<Explore />);
    await screen.findByText("5 companies to explore");
    expect(screen.getByRole("link", { name: /I can refer/ }).getAttribute("href")).toBe("/referrer");
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
    expect(await screen.findByText("Product Designer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save Product Designer" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/saved-roles/1", expect.objectContaining({ method: "PUT" })));
    expect(await screen.findByRole("button", { name: "Unsave Product Designer" })).toBeTruthy();
  });

  it("stays honest when a company has no listed roles", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ jobs: [] }) })));
    render(<ExploreCompany />);
    expect(await screen.findByText("No listed roles right now")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Ask for a referral/ }).getAttribute("href")).toBe("/ask");
  });
});
