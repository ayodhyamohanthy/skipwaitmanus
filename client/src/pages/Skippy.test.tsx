// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";

let authState = { isSignedIn: true, isLoaded: true, getToken: vi.fn(async () => "t"), openSignIn: vi.fn() };
vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
}));
vi.mock("@/lib/resumeUpload", () => ({
  validateResumeFile: () => "",
  uploadResume: vi.fn(async () => ({ id: 55, fileName: "new.pdf" })),
}));

import Skippy, { GOAL_PAGE } from "./Skippy";

type Handler = (body: Record<string, unknown>) => { status?: number; json: unknown };

function mockFetch(handler: Handler) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/skippie/state")) return new Response(JSON.stringify({ session: { step: "job_link" }, resumes: [{ id: 11, fileName: "old.pdf" }] }), { status: 200 });
    const out = handler(JSON.parse(String(init?.body ?? "{}")));
    return new Response(JSON.stringify(out.json), { status: out.status ?? 200 });
  });
}

const QUOTE = { level: 5, cost: 1, totalAvailable: 2, shortfall: 0 };
const fullSession = { step: "quote", note: "My own note.", quote: QUOTE, jobSource: "link", requirements: [], facts: [], matches: [], gaps: [] };

describe("Skippy page (legacy fallback)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubEnv("VITE_GOAL_SURFACES", "");
    authState = { isSignedIn: true, isLoaded: true, getToken: vi.fn(async () => "t"), openSignIn: vi.fn() };
  });
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

describe("Skippy goal page (VITE_GOAL_SURFACES=skippy)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubEnv("VITE_GOAL_SURFACES", "skippy");
    authState = { isSignedIn: true, isLoaded: true, getToken: vi.fn(async () => "t"), openSignIn: vi.fn() };
  });
  afterEach(() => {
    cleanup();
  });

  it("exports GOAL_PAGE contract with goalLine 'Get your ask ready.'", () => {
    expect(GOAL_PAGE).toBeDefined();
    expect(GOAL_PAGE.goalLine).toBe("Get your ask ready.");
  });

  it("renders signed out goal state and satisfies assertGoalPage", async () => {
    authState = { isSignedIn: false, isLoaded: true, getToken: vi.fn(async () => "t"), openSignIn: vi.fn() };
    const { container } = render(<Skippy />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Get your ask ready.");
    assertGoalPage(container, GOAL_PAGE);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(authState.openSignIn).toHaveBeenCalled();
  });

  it("renders job_link step and satisfies assertGoalPage with Send primary button", async () => {
    const fetchMock = mockFetch(body => ({ json: { replies: ["Reading it now…", "Job post read."], session: { step: "resume", jobSource: "link", requirements: ["x"] } } }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<Skippy />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    assertGoalPage(container, GOAL_PAGE);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Get your ask ready.");
    fireEvent.change(screen.getByLabelText("Job link"), { target: { value: "https://jobs.acme.com/1" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Job post read.");
  });

  it("renders resume step and satisfies assertGoalPage with Upload a resume primary button", async () => {
    const resumeSession = { step: "resume", jobSource: "link", requirements: ["react"], facts: [], matches: [], gaps: [] };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/skippie/state")) return new Response(JSON.stringify({ session: resumeSession, resumes: [{ id: 1, fileName: "test.pdf" }] }), { status: 200 });
      return new Response(JSON.stringify({ replies: [], session: resumeSession }), { status: 200 });
    }));
    const { container } = render(<Skippy />);
    await screen.findByRole("button", { name: "Upload a resume" });
    assertGoalPage(container, GOAL_PAGE);
    expect(screen.getByRole("button", { name: "Upload a resume" }).getAttribute("data-g-primary")).toBe("true");
  });

  it("renders consent step and satisfies assertGoalPage with Yes primary button", async () => {
    const consentSession = { step: "consent", attachmentName: "resume.pdf", jobSource: "link", requirements: [], facts: [], matches: [], gaps: [] };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/skippie/state")) return new Response(JSON.stringify({ session: consentSession, resumes: [] }), { status: 200 });
      return new Response(JSON.stringify({ replies: [], session: consentSession }), { status: 200 });
    }));
    const { container } = render(<Skippy />);
    await screen.findByRole("button", { name: "Yes, compare it" });
    assertGoalPage(container, GOAL_PAGE);
    expect(screen.getByRole("button", { name: "Yes, compare it" }).getAttribute("data-g-primary")).toBe("true");
  });

  it("renders fit step and satisfies assertGoalPage with Save my note primary button", async () => {
    const fitSession = { step: "fit", matches: [{ requirement: "React", factId: "f1" }], facts: [{ id: "f1", text: "5 years React", source: "resume" }], gaps: ["Go"], note: "Hello referrer", consentToAi: true, requirements: [] };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/skippie/state")) return new Response(JSON.stringify({ session: fitSession, resumes: [] }), { status: 200 });
      return new Response(JSON.stringify({ replies: [], session: fitSession }), { status: 200 });
    }));
    const { container } = render(<Skippy />);
    await screen.findByRole("button", { name: "Save my note" });
    assertGoalPage(container, GOAL_PAGE);
    expect(screen.getByRole("button", { name: "Save my note" }).getAttribute("data-g-primary")).toBe("true");
  });

  it("renders tailor_skills step and satisfies assertGoalPage with Build primary button", async () => {
    const skillsSession = { step: "tailor_skills", tailor: { additions: [{ skill: "Go", confirmed: true }] }, requirements: [], facts: [], matches: [], gaps: [] };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/skippie/state")) return new Response(JSON.stringify({ session: skillsSession, resumes: [] }), { status: 200 });
      return new Response(JSON.stringify({ replies: [], session: skillsSession }), { status: 200 });
    }));
    const { container } = render(<Skippy />);
    await screen.findByRole("button", { name: "Build the tailored resume" });
    assertGoalPage(container, GOAL_PAGE);
    expect(screen.getByRole("button", { name: "Build the tailored resume" }).getAttribute("data-g-primary")).toBe("true");
  });

  it("renders tailor_review step and satisfies assertGoalPage with Use it primary button", async () => {
    const reviewSession = { step: "tailor_review", tailor: { generatedText: "Tailored resume text" }, requirements: [], facts: [], matches: [], gaps: [] };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/skippie/state")) return new Response(JSON.stringify({ session: reviewSession, resumes: [] }), { status: 200 });
      return new Response(JSON.stringify({ replies: [], session: reviewSession }), { status: 200 });
    }));
    const { container } = render(<Skippy />);
    await screen.findByRole("button", { name: "Use it for this ask" });
    assertGoalPage(container, GOAL_PAGE);
    expect(screen.getByRole("button", { name: "Use it for this ask" }).getAttribute("data-g-primary")).toBe("true");
  });

  it("renders quote step with referral wording (no 'credits') and satisfies assertGoalPage", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/skippie/state")) return new Response(JSON.stringify({ session: fullSession, resumes: [] }), { status: 200 });
      return new Response(JSON.stringify({ replies: [], session: fullSession }), { status: 200 });
    }));
    const { container } = render(<Skippy />);
    await screen.findByText(/1 referral/);
    expect(container.textContent).not.toMatch(/\bcredit(s)?\b/i);
    assertGoalPage(container, GOAL_PAGE);
    expect(screen.getByRole("button", { name: "Send it" }).getAttribute("data-g-primary")).toBe("true");
  });

  it("renders done step and satisfies assertGoalPage", async () => {
    const doneSession = { ...fullSession, step: "done", createdRequestId: 42, coverageStatus: "covered" };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/skippie/state")) return new Response(JSON.stringify({ session: doneSession, resumes: [] }), { status: 200 });
      return new Response(JSON.stringify({ replies: [], session: doneSession }), { status: 200 });
    }));
    const { container } = render(<Skippy />);
    await screen.findByText(/Your referral request is with verified employees/);
    assertGoalPage(container, GOAL_PAGE);
  });
});
