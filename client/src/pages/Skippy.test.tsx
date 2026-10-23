// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, isLoaded: true, getToken: vi.fn(async () => "t"), openSignIn: vi.fn() }),
}));
vi.mock("@/lib/resumeUpload", () => ({
  validateResumeFile: () => "",
  uploadResume: vi.fn(async () => ({ id: 55, fileName: "new.pdf" })),
}));

import Skippy from "./Skippy";

type Handler = (body: Record<string, unknown>) => { status?: number; json: unknown };

function mockFetch(handler: Handler) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/skippie/state")) return new Response(JSON.stringify({ session: { step: "job_link" }, resumes: [{ id: 11, fileName: "old.pdf" }] }), { status: 200 });
    const out = handler(JSON.parse(String(init?.body ?? "{}")));
    return new Response(JSON.stringify(out.json), { status: out.status ?? 200 });
  });
}

const QUOTE = { level: 5, cost: 1, totalAvailable: 2, shortfall: 0, covered: true };
const fullSession = { step: "quote", note: "My own note.", quote: QUOTE, jobSource: "link", requirements: [], facts: [], matches: [], gaps: [] };

describe("Skippy page", () => {
  beforeEach(() => { vi.unstubAllGlobals(); });
  afterEach(() => { cleanup(); });

  it("starts the flow with a job link and shows replies in the chat", async () => {
    const fetchMock = mockFetch(body => ({ json: { replies: ["Reading it now…", "Job post read."], session: { step: "resume", jobSource: "link", requirements: ["x"] } } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Skippy />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled()); // initial state fetch
    fireEvent.change(screen.getByLabelText("Job link"), { target: { value: "https://jobs.acme.com/1" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Job post read.");
    expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toEqual({ kind: "text", text: "https://jobs.acme.com/1" });
  });

  it("lists saved resumes at the resume step and choosing one sends choose_resume", async () => {
    let step: string = "resume";
    const fetchMock = mockFetch(body => {
      if (body.kind === "choose_resume") return { json: { replies: ["That file works."], session: { step: "consent" } } };
      return { json: { replies: [], session: { step: "resume" } } };
    });
    // Initial state at resume step.
    const stateFetch = new Response(JSON.stringify({ session: { step: "resume" }, resumes: [{ id: 11, fileName: "old.pdf" }] }), { status: 200 });
    const real = fetchMock;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/skippie/state")) return stateFetch;
      return real(input, init);
    }));
    render(<Skippy />);
    const saved = await screen.findByRole("button", { name: "old.pdf" });
    fireEvent.click(saved);
    await screen.findByText("That file works.");
    expect(JSON.parse(String((real as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1]?.body))).toEqual({ kind: "choose_resume", attachmentId: 11 });
    expect(step).toBe("resume");
  });

  it("shows the live quote and only creates the ask on Send it", async () => {
    const created: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/skippie/state")) return new Response(JSON.stringify({ session: fullSession, resumes: [] }), { status: 200 });
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.kind === "confirm_send") { created.push(body); return new Response(JSON.stringify({ replies: ["Your ask is in."], session: { ...fullSession, step: "done", createdRequestId: 42, coverageStatus: "covered" } }), { status: 200 }); }
      return new Response(JSON.stringify({ replies: [], session: fullSession }), { status: 200 });
    }));
    render(<Skippy />);
    await screen.findByText(/costs 1 credit/);
    expect(screen.getByText("Your note: My own note.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send it" }));
    await screen.findByText("Your ask is in.");
    expect(created).toEqual([{ kind: "confirm_send", send: true }]);
    await screen.findByText("Track it under My asks");
  });

  it("known-uncovered company with a short wallet: Send it stays, no top-up swap", async () => {
    const uncoveredSession = { ...fullSession, quote: { level: 6, cost: 6, totalAvailable: 0, shortfall: 6, covered: false } };
    const created: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/skippie/state")) return new Response(JSON.stringify({ session: uncoveredSession, resumes: [] }), { status: 200 });
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.kind === "confirm_send") { created.push(body); return new Response(JSON.stringify({ replies: ["Your ask is saved."], session: { ...uncoveredSession, step: "done", createdRequestId: 888, coverageStatus: "waiting_for_company_coverage" } }), { status: 200 }); }
      return new Response(JSON.stringify({ replies: [], session: uncoveredSession }), { status: 200 });
    }));
    render(<Skippy />);
    await screen.findByText(/waits - free - until one is/);
    await screen.findByText(/uses 6 credits only at that moment/);
    expect(screen.queryByRole("link", { name: /Add credits/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send it" }));
    await screen.findByText("Your ask is saved.");
    expect(created).toEqual([{ kind: "confirm_send", send: true }]);
  });

  it("covered company with a short wallet keeps the top-up swap", async () => {
    const coveredSession = { ...fullSession, quote: { level: 6, cost: 6, totalAvailable: 0, shortfall: 6, covered: true } };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/skippie/state")) return new Response(JSON.stringify({ session: coveredSession, resumes: [] }), { status: 200 });
      return new Response(JSON.stringify({ replies: [], session: coveredSession }), { status: 200 });
    }));
    render(<Skippy />);
    await screen.findByText(/costs 6 credits/);
    const topUp = screen.getByRole("link", { name: "Add credits on /plans" }) as HTMLAnchorElement;
    expect(topUp.getAttribute("href")).toBe("/plans#packs");
    expect(screen.queryByRole("button", { name: "Send it" })).toBeNull();
  });

  it("surfaces a server error instead of failing silently", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/skippie/state")) return new Response(JSON.stringify({ session: { step: "job_link" }, resumes: [] }), { status: 200 });
      return new Response(JSON.stringify({ error: "The job description is too thin." }), { status: 422 });
    }));
    render(<Skippy />);
    fireEvent.change(await screen.findByLabelText("Job link"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect((await screen.findByRole("alert")).textContent).toContain("too thin");
  });
});
