import path from "node:path";
import { DEMO, SANDBOX_COMPANY } from "./liveQaJourneyContracts.mjs";
import { JOB_LINK_COMPANY, JOB_LINK_FIXTURE, runJourneys } from "./live-qa-journeys.mjs";

export type Role = "seeker" | "referrer";
export type Reply = { status: number; body?: unknown };
export type Call = {
  role: Role | "public"; method: string; path: string; body?: unknown;
  headers?: Record<string, string>; width?: number; email?: string;
};
export type Capture = {
  status: number; title: string; pageErrors: string[]; consoleErrors: string[];
  clientErrors: string[]; capture: string; navigationError?: string;
};
export type LedgerRow = {
  id: number; kind: string; credits: number; bucket: string;
  reference: { type: string; id: string }; createdAt: string;
};
type Request = { id: number; attachmentId: number; status: "pending" | "approved" | "passed"; claimed: boolean; refunded: boolean; withdrawn: boolean };
type Options = {
  identity?: (role: Role, read: number) => string;
  wallet?: Record<string, unknown>;
  // Overrides run AFTER the fixture server acts, allowing a lost/malformed committed response.
  reply?: (call: Call, reply: Reply) => Reply | undefined;
  capture?: (call: Call, capture: Capture) => Capture;
  ledger?: (rows: LedgerRow[]) => LedgerRow[];
};
export interface Harness {
  io: {
    clientFor: (role: Role) => {
      signIn: (password: string) => Promise<Reply>; me: () => Promise<Reply>;
      get: (target: string) => Promise<Reply>;
      post: (target: string, body?: unknown, headers?: Record<string, string>) => Promise<Reply>;
      capture: (target: string, width: number) => Promise<Capture>;
    };
    fetchText: (url: string) => Promise<string>; mkdir: () => Promise<void>;
    writeFile: (file: string, text: string) => Promise<void>;
    appendSummary: (text: string) => Promise<void>; setOutput: (text: string) => Promise<void>;
    log: (line: string) => void; outDir: string; now: number;
  };
  calls: Call[]; lines: string[]; summaries: string[]; outputs: string[];
  files: Map<string, string>; requests: Map<number, Request>;
  remaining: () => number[]; writes: { path: string; remaining: number[] }[];
  ledger: () => LedgerRow[];
}
export const PASSWORDS = { seeker: "seeker-fixture-password-0001", referrer: "referrer-fixture-password-02" };
export const PRIVATE = { name: "Private fixture candidate", note: "private-note-never-in-artifacts", storage: "private-storage-object-key" };
export const RELEASE = { api: "a".repeat(40), web: "b".repeat(40) };
const AT = "2026-11-28T10:00:00.000Z";
const LOCKED = [{ mimeType: "image/png", fileSize: 70, availability: "after_claim" }];

/** Isolated in-memory API/browser fixture: no real browser, credentials, network or clock. */
export function harness(options: Options = {}): Harness {
  const calls: Call[] = [], lines: string[] = [], summaries: string[] = [], outputs: string[] = [];
  const files = new Map<string, string>(), requests = new Map<number, Request>();
  const writes: { path: string; remaining: number[] }[] = [];
  const reads = { seeker: 0, referrer: 0 }, emails = { ...DEMO };
  let nextAttachment = 500, nextRequest = 9000;
  const remaining = () => [...requests.values()].filter(row => !row.withdrawn).map(row => row.id);
  const ledger = (): LedgerRow[] => {
    const rows = [...requests.values()].flatMap(row => {
      const entry = (refund: boolean): LedgerRow => ({
        id: row.id * 10 + Number(refund), kind: refund ? "withdrawal_refund" : "credit_spend",
        credits: refund ? 1 : -1, bucket: "cycle", createdAt: AT,
        reference: { type: "referral_request", id: `${row.id}#${refund ? "refund#1" : "1"}` },
      });
      return row.refunded ? [entry(false), entry(true)] : [entry(false)];
    });
    return options.ledger?.(rows) ?? rows;
  };
  const detail = (row: Request) => ({ request: {
    id: row.id, status: row.status, companyDomain: SANDBOX_COMPANY.domain,
    referrerId: row.claimed ? 2 : null, revision: 1, candidateMessage: PRIVATE.note,
    ...(row.status === "approved" ? { candidateName: PRIVATE.name } : {}),
    attachments: row.status === "approved" ? [{ id: row.attachmentId, fileName: "qa-demo-resume.png", mimeType: "image/png", fileSize: 70, url: `/api/documents/${row.attachmentId}` }] : LOCKED,
  } });
  const answer = (call: Call): Reply => {
    const pathname = call.path.split("?")[0], body = (call.body ?? {}) as Record<string, unknown>;
    if (call.method === "SIGNIN") return { status: 200, body: { signedIn: true, role: call.role } };
    if (pathname === "/api/credits/summary") {
      // Sandbox provisioning tops up before EACH send; no aggregate delta is promised.
      const total = requests.size ? 2 : 1;
      return { status: 200, body: { summary: { plan: "free", monthlyAllowance: 3,
        monthlyCreditsRemaining: total, purchasedCreditsRemaining: 0, promoCreditsRemaining: 0,
        totalAvailable: total, ledger: { balance: total }, ...options.wallet } } };
    }
    if (pathname === "/api/companies/wipro") return { status: 200, body: { company: { slug: "wipro", name: "Wipro", domains: ["wipro.com"] } } };
    if (call.method === "POST" && pathname === "/api/documents") {
      const id = ++nextAttachment;
      return { status: 201, body: { id, fileName: "qa-demo-resume.png", mimeType: "image/png", fileSize: 70, url: `/api/documents/${id}` } };
    }
    if (call.method === "POST" && pathname === "/api/company-referrals") {
      const id = ++nextRequest;
      requests.set(id, { id, attachmentId: (body.attachmentIds as number[])[0], status: "pending", claimed: false, refunded: false, withdrawn: false });
      return { status: 201, body: { requestId: id, companyDomain: "wipro.com", coverageStatus: "covered", remainingTokens: 2 } };
    }
    if (pathname === "/api/company-referrals/inbox") return { status: 200, body: { requests: [...requests.values()].filter(row => !row.withdrawn).map(row => ({ id: row.id })), scope: "new" } };
    if (pathname === "/api/credits/ledger") return { status: 200, body: { entries: ledger(), internalStorageKey: PRIVATE.storage } };
    if (pathname === "/api/job-link/preview") return { status: 200, body: { canonicalUrl: JOB_LINK_FIXTURE, status: "fresh", employerConfidence: "verified", companyDomain: JOB_LINK_COMPANY, companyName: "ChatFin" } };
    const document = /^\/api\/documents\/(\d+)$/.exec(pathname);
    if (document) {
      const allowed = [...requests.values()].some(row => row.attachmentId === Number(document[1]) && row.status === "approved" && row.claimed && !row.withdrawn);
      return { status: allowed ? 200 : 404 };
    }
    const match = /^\/api\/company-referrals\/(\d+)(?:\/(.+))?$/.exec(pathname);
    const row = match && requests.get(Number(match[1]));
    if (!row || !match) return { status: 404, body: { error: "Unexpected fixture route" } };
    const action = match[2];
    if (call.method === "GET") {
      if (call.role === "seeker") return { status: 403, body: { error: "Verify your work email", code: "work_email_code_required" } };
      if (action === "preview") return { status: 200, body: { request: { id: row.id, status: "pending", attachments: LOCKED, candidateMessage: PRIVATE.note } } };
      return { status: 200, body: detail(row) };
    }
    if (action === "withdraw") {
      if (call.role !== "seeker") return { status: 404, body: { error: "Request not in your account" } };
      if (row.claimed && row.status !== "passed") return { status: 409, body: { error: "Request can no longer be withdrawn" } };
      row.withdrawn = true;
      row.refunded = row.status !== "passed";
      return { status: 200, body: { withdrawn: true } };
    }
    if (action === "claim") {
      row.claimed = true;
      return { status: 200, body: { requestId: row.id, claimed: true, companyDomain: "wipro.com", revision: 1, replayed: false } };
    }
    if (action === "one-click-review") {
      if (body.decision === "approved") {
        if (body.ethicsConfirmed !== true) return { status: 400, body: { error: "Confirmation required" } };
        row.status = "approved";
        return { status: 200, body: { status: "approved" } };
      }
      if (body.decision !== "declined" || body.declineReason !== "cannot_support") return { status: 400, body: { error: "Choose cannot_support" } };
      row.status = "passed";
      return { status: 200, body: { status: "passed", declineReason: "cannot_support" } };
    }
    if (action === "step-back") {
      row.claimed = false;
      row.status = "pending";
      return { status: 200, body: { steppedBack: true, reason: "stepped_back" } };
    }
    return { status: 404 };
  };
  const send = (call: Call) => {
    calls.push(call);
    const response = answer(call);
    return options.reply?.(call, response) ?? response;
  };
  const clientFor = (role: Role) => ({
    signIn: async (_password: string) => send({ role, method: "SIGNIN", path: "/api/auth/reviewer/sign-in" }),
    me: async () => {
      emails[role] = options.identity?.(role, ++reads[role]) ?? DEMO[role];
      const call = { role, method: "GET", path: "/api/trpc/auth.me", email: emails[role] };
      calls.push(call);
      const reply = { status: 200, body: { result: { data: { json: { id: role === "seeker" ? 1 : 2, email: emails[role] } } } } };
      return options.reply?.(call, reply) ?? reply;
    },
    get: async (target: string) => send({ role, method: "GET", path: target, email: emails[role] }),
    post: async (target: string, body?: unknown, headers?: Record<string, string>) => send({ role, method: "POST", path: target, body, headers, email: emails[role] }),
    capture: async (target: string, width: number) => {
      const call: Call = { role, method: "CAPTURE", path: target, width };
      calls.push(call);
      const file = path.join("live-qa", role, `${target.slice(1).replaceAll("/", "-")}-${width}.png`);
      files.set(file, "png");
      const capture: Capture = { status: 200, title: "Fixture page", pageErrors: [], consoleErrors: [], clientErrors: [], capture: file };
      return options.capture?.(call, capture) ?? capture;
    },
  });
  const io = {
    clientFor,
    fetchText: async (url: string) => {
      calls.push({ role: "public", method: "FETCH", path: url });
      if (url === "https://skipwait.me/api/health/ready") return JSON.stringify({ ok: true, state: "ready", commitSha: RELEASE.api });
      if (url === "https://skipwait.me/") return `<meta name="git-commit" content="${RELEASE.web}">`;
      throw new Error("Unexpected public fixture URL");
    },
    mkdir: async () => {},
    writeFile: async (file: string, text: string) => { writes.push({ path: file, remaining: remaining() }); files.set(file, text); },
    appendSummary: async (text: string) => { summaries.push(text); },
    setOutput: async (text: string) => { outputs.push(text); },
    log: (line: string) => { lines.push(line); }, outDir: "live-qa", now: Date.parse(AT),
  };
  return { io, calls, files, lines, summaries, outputs, requests, remaining, writes, ledger };
}
export const run = (fixture: Harness, extra: object = {}) => runJourneys({ passwords: PASSWORDS, trigger: "workflow_dispatch", ...fixture.io, ...extra });
export const posts = (fixture: Harness) => fixture.calls.filter(call => call.method === "POST");
export const everything = (fixture: Harness) => [...fixture.lines, ...fixture.summaries, ...fixture.outputs, ...fixture.files.values()].join("\n");
