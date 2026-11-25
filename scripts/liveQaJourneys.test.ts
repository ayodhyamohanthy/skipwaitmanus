// @vitest-environment node
// OPS-live-qa-journeys (D-389): the signed-in journeys mode proves the wallet, document privacy and the
// send/claim/accept/withdraw rules on skipwait.me with the two demo accounts only, never a payment.
// Everything here runs on fixtures: a fake client, no network and no browser.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEMO, DEMO_COMPANY_DOMAIN, JOB_LINK_COMPANY, JOB_LINK_FIXTURE, MIN_CREDITS, QA_ROLE_TITLE,
  identityProblem, ledgerFor, moneyProblems, parseMode, privacyProblems, revealProblems, runJourneys, trpcJson, walletTotal,
} from "./live-qa-journeys.mjs";

const root = path.resolve(__dirname, "..");
const WORKFLOW = readFileSync(path.join(root, ".github/workflows/live-qa.yml"), "utf8");
const SEEKER_PW = "seeker-fixture-password-0001";
const REFERRER_PW = "referrer-fixture-password-02";
const API_SHA = "a".repeat(40);
const WEB_SHA = "b".repeat(40);

type Reply = { status: number; body?: unknown };
type Call = { role: string; method: string; path: string; body?: unknown; headers?: Record<string, string> };

/** A fake signed-in client: records every call and answers from fixtures, so the tests prove the sequence. */
function harness(options: {
  emails?: { seeker?: string; referrer?: string };
  wallet?: number[];
  existingOpportunity?: boolean;
  coverage?: "covered" | "waiting_for_company_coverage";
  preview?: unknown;
  detail?: unknown;
  signIn?: { seeker?: number; referrer?: number };
  echoPassword?: boolean;
} = {}) {
  const calls: Call[] = [];
  const files = new Map<string, string>();
  const lines: string[] = [];
  const summaries: string[] = [];
  const outputs: string[] = [];
  const walletQueue = [...(options.wallet ?? [3, 2])];
  const emails = { seeker: DEMO.seeker, referrer: DEMO.referrer, ...options.emails };
  const signIn = { seeker: 200, referrer: 200, ...options.signIn };
  let opportunityId = options.existingOpportunity ? 77 : null;
  let sequence = 9000;
  let attachmentSequence = 500;
  const created: number[] = [];
  const claimed = new Set<number>();
  const steppedBack = new Set<number>();
  const accepted = new Set<number>();
  const declined = new Set<number>();
  const withdrawn = new Set<number>();

  const ledger = () => {
    const rows: unknown[] = [];
    for (const id of created) {
      rows.push({ id: id * 10, kind: "credit_spend", credits: -1, bucket: "cycle", reference: { type: "referral_request", id: String(id) }, createdAt: new Date().toISOString() });
      // A withdrawal returns the credit unless the latest pickup is still a claim (D-147, D-021).
      if (withdrawn.has(id) && (!claimed.has(id) || steppedBack.has(id))) rows.push({ id: id * 10 + 1, kind: "withdrawal_refund", credits: 1, bucket: "cycle", reference: { type: "referral_request", id: String(id) }, createdAt: new Date().toISOString() });
    }
    return rows;
  };

  const reply = (role: string, method: string, target: string, body?: unknown): Reply => {
    const pathname = target.split("?")[0];
    if (method === "GET" && pathname === "/api/credits/summary") {
      const total = walletQueue.length > 1 ? walletQueue.shift()! : walletQueue[0];
      return { status: 200, body: { summary: { totalAvailable: total } } };
    }
    if (method === "GET" && pathname === "/api/opportunities/mine") {
      return { status: 200, body: { opportunities: opportunityId ? [{ id: opportunityId, companyDomain: DEMO_COMPANY_DOMAIN, kind: "walk_in", roleTitle: QA_ROLE_TITLE, isActive: true, expired: false, expiresAt: new Date(Date.now() + 3_600_000).toISOString() }] : [] } };
    }
    if (method === "POST" && pathname === "/api/opportunities") {
      opportunityId = 77;
      return { status: 201, body: { opportunity: { id: 77, companyDomain: DEMO_COMPANY_DOMAIN, kind: "walk_in", roleTitle: QA_ROLE_TITLE } } };
    }
    if (method === "POST" && pathname === "/api/documents") {
      attachmentSequence += 1;
      return { status: 201, body: { id: attachmentSequence, fileName: "qa-demo-resume.png", mimeType: "image/png", fileSize: 70, url: `/api/documents/${attachmentSequence}` } };
    }
    if (method === "POST" && pathname === "/api/company-referrals") {
      sequence += 1;
      created.push(sequence);
      return { status: 201, body: { requestId: sequence, companyDomain: DEMO_COMPANY_DOMAIN, coverageStatus: options.coverage ?? "covered", remainingTokens: 2 } };
    }
    if (method === "GET" && pathname === "/api/company-referrals/inbox") {
      return { status: 200, body: { requests: created.map(id => ({ id })), scope: "new" } };
    }
    if (method === "GET" && /^\/api\/company-referrals\/\d+\/preview$/.test(pathname)) {
      // The preview is the referrer's own view; the seeker gets the no-access 404.
      if (role !== "referrer") return { status: 404, body: { error: "This private request is not available to your verified company account" } };
      return { status: 200, body: options.preview ?? { request: { id: created[0], attachments: [{ mimeType: "image/png", fileSize: 70, availability: "after_claim" }] } } };
    }
    if (method === "POST" && /^\/api\/company-referrals\/\d+\/claim$/.test(pathname)) {
      claimed.add(Number(pathname.split("/")[3]));
      return { status: 200, body: { requestId: created[0], claimed: true } };
    }
    if (method === "POST" && /^\/api\/company-referrals\/\d+\/step-back$/.test(pathname)) {
      steppedBack.add(Number(pathname.split("/")[3]));
      return { status: 200, body: { steppedBack: true, reason: "stepped_back" } };
    }
    if (method === "POST" && /^\/api\/company-referrals\/\d+\/one-click-review$/.test(pathname)) {
      const id = Number(pathname.split("/")[3]);
      const decision = (body as { decision?: string } | undefined)?.decision;
      if (decision === "approved") accepted.add(id); else declined.add(id);
      return { status: 200, body: { status: decision === "approved" ? "approved" : "declined" } };
    }
    if (method === "GET" && /^\/api\/company-referrals\/\d+$/.test(pathname)) {
      // The claimed detail is the assigned referrer's view; the seeker gets the no-access 404.
      if (role !== "referrer") return { status: 404, body: { error: "This private request is not assigned to your verified employee account" } };
      return { status: 200, body: options.detail ?? { request: { id: created[0], candidateName: "Demo seeker", attachments: [{ id: 501, fileName: "qa-demo-resume.png", mimeType: "image/png", fileSize: 70, url: "/api/documents/501" }] } } };
    }
    if (method === "POST" && /^\/api\/company-referrals\/\d+\/withdraw$/.test(pathname)) {
      withdrawn.add(Number(pathname.split("/")[3]));
      return { status: 200, body: { withdrawn: true } };
    }
    if (method === "GET" && pathname === "/api/documents/501") {
      // D-019(e): the file opens only after the referrer's own acceptance.
      return accepted.size ? { status: 200, body: undefined } : { status: 404, body: undefined };
    }
    if (method === "GET" && pathname === "/api/credits/ledger") {
      return { status: 200, body: { entries: ledger() } };
    }
    if (method === "POST" && pathname === "/api/job-link/preview") {
      return { status: 200, body: { canonicalUrl: JOB_LINK_FIXTURE, status: "fresh", employerConfidence: "verified", companyDomain: JOB_LINK_COMPANY, companyName: "ChatFin", reason: "Company identified from the job link.", recoveryAction: "Continue to your resume." } };
    }
    if (method === "POST" && /^\/api\/opportunities\/\d+\/close$/.test(pathname)) {
      return { status: 200, body: { closed: true } };
    }
    return { status: 404, body: { error: `unexpected ${method} ${pathname}` } };
  };

  const clientFor = (role: string) => ({
    signIn: async (password: string) => {
      calls.push({ role, method: "SIGNIN", path: "/api/auth/reviewer/sign-in" });
      const status = signIn[role as "seeker" | "referrer"];
      if (status !== 200 && options.echoPassword) return { status, body: { error: `refused ${password}` } };
      return { status, body: { signedIn: status === 200, role } };
    },
    me: async () => {
      calls.push({ role, method: "GET", path: "/api/trpc/auth.me" });
      return { status: 200, body: { result: { data: { json: { id: role === "seeker" ? 1 : 2, email: emails[role as "seeker" | "referrer"] } } } } };
    },
    get: async (target: string) => {
      calls.push({ role, method: "GET", path: target });
      return reply(role, "GET", target);
    },
    post: async (target: string, body?: unknown, headers?: Record<string, string>) => {
      calls.push({ role, method: "POST", path: target, body, headers });
      return reply(role, "POST", target, body);
    },
    capture: async (target: string, width: number) => {
      calls.push({ role, method: "CAPTURE", path: target });
      const file = path.join("live-qa", role, `${target.replace(/^\//, "").replace(/\//g, "-")}-${width}.png`);
      files.set(file, "png");
      return { status: 200, title: `Title ${target}`, pageErrors: [], consoleErrors: [], clientErrors: [], capture: file };
    },
  });

  const io = {
    clientFor,
    fetchText: async (url: string) => {
      calls.push({ role: "public", method: "FETCH", path: url });
      if (url === "https://skipwait.me/api/health/ready") return JSON.stringify({ ok: true, state: "ready", commitSha: API_SHA });
      if (url === "https://skipwait.me/") return `<html><head><meta name="git-commit" content="${WEB_SHA}"></head></html>`;
      throw new Error(`unexpected fetch ${url}`);
    },
    mkdir: async () => {},
    writeFile: async (p: string, text: string) => { files.set(p, text); },
    appendSummary: async (text: string) => { summaries.push(text); },
    setOutput: async (text: string) => { outputs.push(text); },
    log: (line: string) => { lines.push(line); },
    outDir: "live-qa",
  };
  return { io, calls, files, lines, summaries, outputs, created, claimed, steppedBack, accepted, declined, withdrawn };
}

const run = (h: ReturnType<typeof harness>, extra: object = {}) =>
  runJourneys({ passwords: { seeker: SEEKER_PW, referrer: REFERRER_PW }, trigger: "workflow_dispatch", ...h.io, ...extra });
const everything = (h: ReturnType<typeof harness>) => [...h.lines, ...h.summaries, ...h.outputs, ...h.files.values()].join("\n");
const posts = (h: ReturnType<typeof harness>) => h.calls.filter(c => c.method === "POST");

describe("constants and pure rules", () => {
  it("pins the two demo accounts and their company domain", () => {
    expect(DEMO).toEqual({ seeker: "seeker@reviewer.skipwait.me", referrer: "referrer@reviewer.skipwait.me" });
    expect(DEMO_COMPANY_DOMAIN).toBe("reviewer.skipwait.me");
    expect(MIN_CREDITS).toBe(1);
    expect(JOB_LINK_FIXTURE).toBe("https://wellfound.com/jobs/3971835-account-executive");
    expect(JOB_LINK_COMPANY).toBe("chatfin.ai");
  });

  it("parses the mode input and refuses anything else", () => {
    expect(parseMode(undefined)).toBe("navigate");
    expect(parseMode("navigate")).toBe("navigate");
    expect(parseMode("journeys")).toBe("journeys");
    expect(() => parseMode("money")).toThrow(/navigate or journeys/);
  });

  it("fails closed unless the signed-in account is exactly the demo account for its role", () => {
    expect(identityProblem("seeker", DEMO.seeker)).toBeNull();
    expect(identityProblem("referrer", DEMO.referrer)).toBeNull();
    expect(identityProblem("seeker", "someone@example.com")).toMatch(/not seeker@reviewer\.skipwait\.me/);
    expect(identityProblem("referrer", DEMO.seeker)).toMatch(/not referrer@reviewer\.skipwait\.me/);
    expect(identityProblem("seeker", undefined)).toMatch(/not seeker@reviewer\.skipwait\.me/);
  });

  it("reads the superjson tRPC payload and the wallet total", () => {
    expect(trpcJson({ result: { data: { json: { email: DEMO.seeker } } } })).toEqual({ email: DEMO.seeker });
    expect(trpcJson([{ result: { data: { json: null } } }])).toBeNull();
    expect(trpcJson({ result: { data: { email: "plain" } } })).toEqual({ email: "plain" });
    expect(walletTotal({ summary: { totalAvailable: 3 } })).toBe(3);
    expect(walletTotal({ summary: { totalAvailable: 0 } })).toBe(0);
    expect(walletTotal({ summary: {} })).toBeNull();
    expect(walletTotal(null)).toBeNull();
  });

  it("separates a request's spend row from its withdrawal refund", () => {
    const entries = [
      { kind: "credit_spend", credits: -1, reference: { type: "referral_request", id: "9001" } },
      { kind: "withdrawal_refund", credits: 1, reference: { type: "referral_request", id: "9001" } },
      { kind: "credit_spend", credits: -1, reference: { type: "referral_request", id: "9002" } },
      { kind: "credit_spend", credits: -1, reference: { type: "referral_request", id: "9003" } },
    ];
    expect(ledgerFor(entries, 9001).spend).toHaveLength(1);
    expect(ledgerFor(entries, 9001).refund).toHaveLength(1);
    expect(ledgerFor(entries, 9002).refund).toHaveLength(0);
    expect(ledgerFor(entries, 9003).refund).toHaveLength(0);
  });

  it("asserts D-034, D-147 and the withdrawal-before-pickup return against the ledger and the wallet", () => {
    const entries = [
      { kind: "credit_spend", credits: -1, reference: { type: "referral_request", id: "9001" } },
      { kind: "credit_spend", credits: -1, reference: { type: "referral_request", id: "9002" } },
      { kind: "withdrawal_refund", credits: 1, reference: { type: "referral_request", id: "9002" } },
      { kind: "credit_spend", credits: -1, reference: { type: "referral_request", id: "9003" } },
    ];
    expect(moneyProblems({ before: 3, after: 1, requestId: 9001, entries, expect: { spend: true, refund: false, walletDelta: -2 } })).toEqual([]);
    expect(moneyProblems({ before: 3, after: 1, requestId: 9002, entries, expect: { spend: true, refund: true, walletDelta: -2 } })).toEqual([]);
    expect(moneyProblems({ before: 3, after: 1, requestId: 9003, entries, expect: { spend: true, refund: false, walletDelta: -2 } })).toEqual([]);
    expect(moneyProblems({ before: 3, after: 3, requestId: 9003, entries, expect: { spend: true, refund: false, walletDelta: -2 } })).toContain("wallet moved 0, expected -2");
    expect(moneyProblems({ before: 3, after: 1, requestId: 9003, entries, expect: { spend: true, refund: true, walletDelta: -2 } })).toContain("no withdrawal refund row for request 9003");
    expect(moneyProblems({ before: 3, after: 1, requestId: 9002, entries, expect: { spend: true, refund: false, walletDelta: -2 } })).toContain("request 9002 was refunded but must stay spent");
  });

  it("refuses a preview that names the seeker or opens a file, and requires both after acceptance", () => {
    expect(privacyProblems({ request: { id: 9001, attachments: [{ mimeType: "image/png", fileSize: 68, availability: "after_claim" }] } })).toEqual([]);
    expect(privacyProblems({ request: { id: 9001, candidateName: "Demo seeker", attachments: [] } })).toContain("the preview names the seeker");
    expect(privacyProblems({ request: { id: 9001, attachments: [{ id: 501, fileName: "resume.png", url: "/api/documents/501" }] } })).toContain("the preview opens a file");
    expect(revealProblems({ request: { id: 9001, candidateName: "Demo seeker", attachments: [{ id: 501, fileName: "resume.png", url: "/api/documents/501" }] } })).toEqual([]);
    expect(revealProblems({ request: { id: 9001, attachments: [] } })).toContain("the accepted detail has no candidate name");
    expect(revealProblems({ request: { id: 9001, candidateName: "Demo seeker", attachments: [{ id: 501, fileName: "resume.png", url: null }] } })).toContain("an accepted file has no link");
  });
});

describe("runJourneys", () => {
  it("fails before any state change when a password secret is missing", async () => {
    const h = harness();
    const { code, summary } = await run(h, { passwords: { seeker: "", referrer: "" } });
    expect(code).toBe(1);
    expect(summary).toBeNull();
    expect(h.lines.join("\n")).toMatch(/::error::REVIEWER_SEEKER_PASSWORD and REVIEWER_REFERRER_PASSWORD not set/);
    expect(h.calls).toEqual([]);
  });

  it("stops before any state change when a signed-in account is not the demo account", async () => {
    const h = harness({ emails: { seeker: "someone@example.com" } });
    const { code, summary } = await run(h);
    expect(code).toBe(1);
    expect(summary.steps.find((s: { name: string }) => s.name === "identity")).toMatchObject({ ok: false });
    expect(posts(h)).toEqual([]);
    expect(h.lines.join("\n")).toMatch(/not seeker@reviewer\.skipwait\.me/);
  });

  it("stops without buying when the demo seeker has no free referral", async () => {
    const h = harness({ wallet: [0] });
    const { code, summary } = await run(h);
    expect(code).toBe(1);
    expect(summary.steps.find((s: { name: string }) => s.name === "wallet-before")).toMatchObject({ ok: false });
    expect(posts(h)).toEqual([]);
    expect(h.lines.join("\n")).toMatch(/no free referral/);
  });

  it("runs the full journey: wallet, privacy, claim, accept, denial, the three money paths and the job link", async () => {
    const h = harness();
    const { code, summary } = await run(h);
    expect(code).toBe(0);
    const names = summary.steps.map((s: { name: string }) => s.name);
    expect(names).toEqual([
      "identity", "wallet-before", "route", "document", "create", "preview-privacy", "document-denied",
      "claim", "accept", "reveal", "cross-role-denied", "step-back", "withdraw-accepted", "create-withdraw",
      "withdraw-before-pickup", "create-decline", "claim-decline", "decline", "withdraw-declined", "ledger",
      "wallet-after", "job-link", "cleanup",
    ]);
    expect(summary.steps.every((s: { ok: boolean }) => s.ok)).toBe(true);
    expect(summary.release).toEqual({ api: API_SHA, web: WEB_SHA });
    // The demo referrer's company is reached through its own walk-in post, never a real company.
    const opportunity = posts(h).find(c => c.path === "/api/opportunities");
    expect(opportunity?.body).toMatchObject({ kind: "walk_in", roleTitle: QA_ROLE_TITLE });
    // The ask carries the demo opportunity and the uploaded resume, with an idempotency key.
    const create = posts(h).find(c => c.path === "/api/company-referrals");
    expect(create?.body).toMatchObject({ opportunityId: 77, attachmentIds: [501] });
    expect(create?.headers?.["Idempotency-Key"]).toMatch(/^[\x21-\x7E]{16,64}$/);
    // The accept is the confirmed act the server requires.
    const accept = posts(h).find(c => c.path.endsWith("/one-click-review") && (c.body as { decision?: string })?.decision === "approved");
    expect(accept?.body).toMatchObject({ decision: "approved", ethicsConfirmed: true });
    // The decline keeps the credit spent; the two closed asks return theirs.
    expect(h.accepted.size).toBe(1);
    expect(h.declined.size).toBe(1);
    expect(h.claimed.size).toBe(2);
    expect(h.withdrawn.size).toBe(3);
    // The opportunity this run created is closed again.
    expect(posts(h).some(c => c.path === "/api/opportunities/77/close")).toBe(true);
    // UI evidence at both widths, before and after acceptance.
    const captures = h.calls.filter(c => c.method === "CAPTURE");
    expect(captures.map(c => `${c.path}@${c.role}`)).toEqual(["/queue@referrer", "/queue@referrer", `/conversation/9001@referrer`, `/conversation/9001@referrer`]);
    expect(h.files.has(path.join("live-qa", "summary.json"))).toBe(true);
    expect(h.outputs).toEqual([`web_sha=${WEB_SHA}`]);
  });

  it("reuses a live demo opportunity instead of publishing another", async () => {
    const h = harness({ existingOpportunity: true });
    const { code } = await run(h);
    expect(code).toBe(0);
    expect(posts(h).some(c => c.path === "/api/opportunities")).toBe(false);
    expect(posts(h).some(c => c.path === "/api/opportunities/77/close")).toBe(false);
  });

  it("fails the preview step when the referrer can see the seeker's name or files", async () => {
    const h = harness({ preview: { request: { id: 9001, candidateName: "Demo seeker", attachments: [{ id: 501, fileName: "resume.png", url: "/api/documents/501" }] } } });
    const { code, summary } = await run(h);
    expect(code).toBe(1);
    expect(summary.steps.find((s: { name: string }) => s.name === "preview-privacy")).toMatchObject({ ok: false });
    expect(posts(h).some(c => c.path.endsWith("/claim"))).toBe(false);
  });

  it("fails the reveal step when acceptance does not open the name and files", async () => {
    const h = harness({ detail: { request: { id: 9001, attachments: [] } } });
    const { code, summary } = await run(h);
    expect(code).toBe(1);
    expect(summary.steps.find((s: { name: string }) => s.name === "reveal")).toMatchObject({ ok: false });
  });

  it("fails when the ask is not covered, so no credit was spent", async () => {
    const h = harness({ coverage: "waiting_for_company_coverage" });
    const { code, summary } = await run(h);
    expect(code).toBe(1);
    expect(summary.steps.find((s: { name: string }) => s.name === "create")).toMatchObject({ ok: false });
    expect(posts(h).some(c => c.path.endsWith("/claim"))).toBe(false);
  });

  it("never prints, writes or summarises a password, even when a sign-in error echoes one", async () => {
    const h = harness({ signIn: { seeker: 401 }, echoPassword: true });
    const { code } = await run(h);
    expect(code).toBe(1);
    const all = everything(h);
    expect(all).not.toContain(SEEKER_PW);
    expect(all).not.toContain(REFERRER_PW);
    expect(all).toContain("[redacted]");
  });
});

describe("workflow", () => {
  it("adds a mode input that defaults to navigate and offers journeys", () => {
    expect(WORKFLOW).toMatch(/mode:[\s\S]*options: \[navigate, journeys\][\s\S]*default: navigate/);
  });

  it("runs journeys only on a manual dispatch, never after a release", () => {
    const step = WORKFLOW.slice(WORKFLOW.indexOf("node scripts/live-qa-journeys.mjs") - 600, WORKFLOW.indexOf("node scripts/live-qa-journeys.mjs"));
    expect(step).toMatch(/if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.mode == 'journeys' \}\}/);
    expect(WORKFLOW).toContain("node scripts/live-qa-journeys.mjs");
    expect(WORKFLOW).not.toMatch(/^\s+(push|pull_request|pull_request_target):/m);
  });

  it("keeps one run at a time across both modes and masks the passwords before either script", () => {
    expect(WORKFLOW).toMatch(/concurrency:\n\s+group: live-qa\n\s+cancel-in-progress: false/);
    const mask = WORKFLOW.indexOf("::add-mask::");
    expect(mask).toBeGreaterThan(0);
    expect(mask).toBeLessThan(WORKFLOW.indexOf("node scripts/live-qa-journeys.mjs"));
    expect(WORKFLOW).not.toMatch(/run:[^\n]*secrets\./);
  });
});
