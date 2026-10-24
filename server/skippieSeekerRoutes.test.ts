import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerSkippieSeekerRoutes, skippieSeekerAllowedIds } from "./skippieSeekerRoutes";
import { SKIPPIE_SEEKER_DAILY_CAP, rulesAnalyzeFit, type SkippieSeekerDeps } from "./skippieSeeker";

const RESUME = "Asha Rao\nSenior Backend Engineer, Acme Corp\nBuilt Node.js and MySQL services\nSkills: Node.js, MySQL";
const JOB = "Senior Backend Engineer at Acme\nRequirements\n- Node.js experience building services\n- MySQL at scale\n- Kubernetes in production";

function makeSkippieDeps(overrides: Partial<SkippieSeekerDeps> = {}): SkippieSeekerDeps {
  return {
    fetchJobText: vi.fn(async () => JOB),
    extractResumeText: vi.fn(async () => RESUME),
    analyzeFit: vi.fn(async input => rulesAnalyzeFit(input)),
    getQuote: vi.fn(async () => ({ level: 5, cost: 1, totalAvailable: 3, shortfall: 0, covered: true })),
    getOwnedResume: vi.fn(async (_u, id) => (id === 11 ? { id: 11, fileName: "a.pdf", fileKey: "k/11", mimeType: "application/pdf" } : undefined)),
    createAsk: vi.fn(async () => ({ requestId: 42, companyDomain: "acme.com", coverageStatus: "covered" as const })),
    saveTailoredResume: vi.fn(async () => ({ id: 12, fileName: "t.docx" })),
    ...overrides,
  };
}

function setup(opts: { role?: "user" | "admin"; userId?: number; signedIn?: boolean; enabled?: boolean; allowed?: number[]; deps?: SkippieSeekerDeps }) {
  const app = express();
  app.use(express.json());
  const recorded: Array<Record<string, unknown>> = [];
  const afterCreate = vi.fn();
  registerSkippieSeekerRoutes(app, {
    resolveIdentity: async () => (opts.signedIn === false ? undefined : { account: { id: opts.userId ?? 7, role: opts.role ?? "user" } }),
    recordActivity: input => { recorded.push(input as never); },
    enabled: () => opts.enabled !== false,
    allowedUserIds: () => new Set(opts.allowed ?? [7]),
    deps: () => opts.deps ?? makeSkippieDeps(),
    listOwnedResumes: async () => [{ id: 11, fileName: "a.pdf", mimeType: "application/pdf" }],
    afterCreate,
  });
  return { app, recorded, afterCreate };
}

const post = (app: express.Express, body: unknown) => request(app).post("/api/skippie/turn").send(body as object);

describe("seeker Skippy routes: gates", () => {
  it("is 404 while the flag is off", async () => {
    const { app } = setup({ enabled: false });
    expect((await post(app, { kind: "text", text: "hi" })).status).toBe(404);
    expect((await request(app).get("/api/skippie/state")).status).toBe(404);
  });
  it("is 401 signed out and 404 for a non-allowlisted seeker (with an audit row)", async () => {
    expect((await post(setup({ signedIn: false }).app, { kind: "text", text: "hi" })).status).toBe(401);
    const { app, recorded } = setup({ userId: 99, allowed: [7] });
    expect((await post(app, { kind: "text", text: "hi" })).status).toBe(404);
    expect(recorded[0].action).toBe("skippie_seeker.denied");
  });
  it("state returns the session and saved resumes for the test seeker", async () => {
    const { app } = setup({});
    const res = await request(app).get("/api/skippie/state");
    expect(res.status).toBe(200);
    expect(res.body.session.step).toBe("job_link");
    expect(res.body.session.idempotencyKey).toBeUndefined(); // never exposed
    expect(res.body.resumes).toEqual([{ id: 11, fileName: "a.pdf", mimeType: "application/pdf" }]);
    expect(res.headers["cache-control"]).toBe("private, no-store");
  });
  it("rejects a malformed turn", async () => {
    const { app } = setup({});
    expect((await post(app, { kind: "nonsense" })).status).toBe(400);
    expect((await post(app, { kind: "choose_resume" })).status).toBe(400);
  });
  it("enforces the per-user daily cap with a plain message", async () => {
    const { app } = setup({});
    for (let i = 0; i < SKIPPIE_SEEKER_DAILY_CAP; i++) expect((await post(app, { kind: "text", text: "x" })).status).toBe(200);
    const res = await post(app, { kind: "text", text: "x" });
    expect(res.status).toBe(429);
    expect(res.body.error).toContain("Skippy limit");
  });
});

describe("seeker Skippy routes: end to end through HTTP", () => {
  it("full ask flow: link, resume, consent, note, send - with audit rows and afterCreate", async () => {
    const deps = makeSkippieDeps();
    const { app, recorded, afterCreate } = setup({ deps });
    expect((await post(app, { kind: "text", text: "https://careers.acme.com/jobs/123" })).status).toBe(200);
    expect((await post(app, { kind: "choose_resume", attachmentId: 11 })).status).toBe(200);
    expect((await post(app, { kind: "consent", allow: true })).status).toBe(200);
    const noteRes = await post(app, { kind: "submit_note", text: "Hi - I built Node.js and MySQL services. Would you be open to referring me?" });
    expect(noteRes.body.session.step).toBe("quote");
    expect(noteRes.body.session.quote).toMatchObject({ cost: 1, totalAvailable: 3, shortfall: 0 });
    const sendRes = await post(app, { kind: "confirm_send", send: true });
    expect(sendRes.status).toBe(200);
    expect(sendRes.body.session.step).toBe("done");
    expect(sendRes.body.session.createdRequestId).toBe(42);
    expect(deps.createAsk).toHaveBeenCalledOnce();
    const input = (deps.createAsk as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(input.personalPitch).toBe("Hi - I built Node.js and MySQL services. Would you be open to referring me?");
    expect(afterCreate).toHaveBeenCalledOnce();
    const actions = recorded.map(r => r.action);
    expect(actions).toContain("skippie_seeker.turn");
    expect(actions).toContain("skippie_seeker.ask_created");
    const created = recorded.find(r => r.action === "skippie_seeker.ask_created");
    expect(created?.resourceId).toBe(42);
    expect((created?.metadata as Record<string, unknown>).via).toBe("skippy");
  });
  it("replaying the same Send does not create a second ask (fixed idempotency key)", async () => {
    const deps = makeSkippieDeps({ createAsk: vi.fn(async () => ({ requestId: 42, companyDomain: "acme.com", coverageStatus: "covered" as const, replayed: true })) });
    const { app } = setup({ deps });
    await post(app, { kind: "text", text: "https://careers.acme.com/jobs/123" });
    await post(app, { kind: "choose_resume", attachmentId: 11 });
    await post(app, { kind: "consent", allow: false });
    await post(app, { kind: "submit_note", text: "My own note." });
    await post(app, { kind: "confirm_send", send: true });
    expect((deps.createAsk as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});

describe("skippieSeekerAllowedIds", () => {
  it("parses the allowlist env", () => {
    expect([...skippieSeekerAllowedIds({ SKIPPIE_SEEKER_USER_IDS: " 7, 12 ,x,-3" } as NodeJS.ProcessEnv)]).toEqual([7, 12]);
    expect(skippieSeekerAllowedIds({} as NodeJS.ProcessEnv).size).toBe(0);
  });
});
