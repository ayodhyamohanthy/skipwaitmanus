// @vitest-environment node
// D-389/D-393 journeys: injected fixtures only, never a live request or browser.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO, SANDBOX_COMPANY } from "./liveQaJourneyContracts.mjs";
import { parseMode } from "./live-qa-journeys.mjs";
import { everything, harness, PASSWORDS, posts, PRIVATE, RELEASE, run, type Call } from "./liveQaJourneyHarness";

const review = (call: Call, decision: string) => call.path.endsWith("/one-click-review") &&
  !!call.body && typeof call.body === "object" && "decision" in call.body && call.body.decision === decision;
const mutations = (calls: Call[]) => calls.filter(call => call.method === "POST");

describe("sandbox journeys", () => {
  it("proves three independently attached requests and exact keyed refunds without public opportunities", async () => {
    const h = harness();
    const { code, summary } = await run(h);
    expect(code).toBe(0);
    expect(summary.release).toEqual(RELEASE);
    expect(summary.steps.every((step: { ok: boolean }) => step.ok)).toBe(true);
    expect(h.calls.some(call => call.path.startsWith("/api/opportunities"))).toBe(false);
    const creates = posts(h).filter(call => call.path === "/api/company-referrals");
    expect(creates).toHaveLength(3);
    creates.forEach((call, index) => {
      expect(call.body).toMatchObject({ companySlug: SANDBOX_COMPANY.slug, targetRoleUrl: SANDBOX_COMPANY.jobUrl, attachmentIds: [501 + index], candidateMessage: expect.any(String) });
      expect(call.body).not.toHaveProperty("opportunityId");
      expect(call.headers?.["Idempotency-Key"]).toMatch(/^[\x21-\x7E]{16,64}$/);
    });
    expect(new Set(creates.map(call => call.headers?.["Idempotency-Key"])).size).toBe(3);
    expect(posts(h).find(call => review(call, "approved"))?.body).toMatchObject({ ethicsConfirmed: true });
    expect(posts(h).find(call => review(call, "declined"))?.body).toMatchObject({ declineReason: "cannot_support" });
    expect(h.ledger().map(row => [row.reference.id, row.kind, row.credits, row.bucket])).toEqual([
      ["9001#1", "credit_spend", -1, "cycle"], ["9001#refund#1", "withdrawal_refund", 1, "cycle"],
      ["9002#1", "credit_spend", -1, "cycle"], ["9002#refund#1", "withdrawal_refund", 1, "cycle"],
      ["9003#1", "credit_spend", -1, "cycle"],
    ]);
    expect(h.remaining()).toEqual([]);
    expect(h.writes.find(write => write.path === path.join("live-qa", "summary.json"))?.remaining).toEqual([]);
    const captures = h.calls.filter(call => call.method === "CAPTURE");
    expect(captures.map(call => [call.path, call.width])).toEqual(expect.arrayContaining([
      ["/queue", 1280], ["/queue", 390], ["/conversation/9001", 1280], ["/conversation/9001", 390],
    ]));
    expect(h.calls.filter(call => call.role === "referrer" && call.method === "GET" && call.path === "/api/documents/501").length).toBeGreaterThanOrEqual(4);
    for (const suffix of ["", "/preview"]) expect(h.calls.some(call => call.role === "seeker" && call.path === `/api/company-referrals/9001${suffix}`)).toBe(true);
    expect(posts(h).some(call => call.role === "referrer" && call.path === "/api/company-referrals/9001/withdraw")).toBe(true);
    expect(h.outputs).toEqual([`web_sha=${RELEASE.web}`]);
  });

  it.each(["workflow_run", "push", ""])("refuses non-manual trigger %j before I/O", async trigger => {
    const h = harness();
    expect((await run(h, { trigger })).code).toBe(1);
    expect(h.calls).toEqual([]);
  });

  it.each(["seeker", "referrer"])("requires the %s password before I/O", async role => {
    const h = harness();
    const result = await run(h, { passwords: { ...PASSWORDS, [role]: "" } });
    expect(result).toMatchObject({ code: 1, summary: null });
    expect(h.calls).toEqual([]);
  });

  it.each(["seeker", "referrer"] as const)("rejects wrong initial %s identity without a mutation", async wrong => {
    const h = harness({ identity: role => role === wrong ? "not-the-demo@example.invalid" : DEMO[role] });
    expect((await run(h)).code).toBe(1);
    expect(posts(h)).toEqual([]);
    expect(everything(h)).not.toContain("not-the-demo@example.invalid");
  });

  it.each([
    ["seeker", "/api/company-referrals"], ["referrer", "/api/company-referrals/9001/claim"],
    ["referrer", "/api/company-referrals/9001/one-click-review"],
  ] as const)("stops %s identity drift after %s, including cleanup", async (wrong, endpoint) => {
    let drift = false;
    const h = harness({
      identity: role => drift && role === wrong ? "changed-account@example.invalid" : DEMO[role],
      reply: call => { if (call.path === endpoint && call.method === "POST") drift = true; return undefined; },
    });
    expect((await run(h)).code).toBe(1);
    expect(posts(h).filter(call => call.email === "changed-account@example.invalid")).toEqual([]);
    expect(h.calls.some(call => call.path === "/api/trpc/auth.me" && call.email === "changed-account@example.invalid")).toBe(true);
    expect(everything(h)).not.toContain("changed-account@example.invalid");
  });

  it.each([
    { monthlyCreditsRemaining: 0, totalAvailable: 0, ledger: { balance: 0 } },
    { purchasedCreditsRemaining: 1 }, { promoCreditsRemaining: 1 }, { plan: "paid" },
    { ledger: { balance: 2 } },
  ])("requires consistent positive free-only wallet %j", async wallet => {
    const h = harness({ wallet });
    expect((await run(h)).code).toBe(1);
    expect(posts(h)).toEqual([]);
  });

  it.each([
    ["directory status", "/api/companies/wipro", { status: 503 }, "/api/documents"],
    ["directory body", "/api/companies/wipro", { status: 200, body: { company: { slug: "other", name: "Wipro", domains: ["wipro.com"] } } }, "/api/documents"],
    ["upload status", "/api/documents", { status: 200 }, "/api/company-referrals"],
    ["upload body", "/api/documents", { status: 201, body: { id: 501, url: "/api/documents/999" } }, "/api/company-referrals"],
  ] as const)("rejects invalid %s before consuming it", async (_name, endpoint, bad, forbidden) => {
    const h = harness({ reply: (call, response) => call.path === endpoint ? { ...response, ...bad } : undefined });
    expect((await run(h)).code).toBe(1);
    expect(posts(h).some(call => call.path === forbidden)).toBe(false);
    expect(h.requests.size).toBe(0);
  });

  it.each([2, 3])("validates upload %i before sending another request", async uploadNumber => {
    let uploads = 0;
    const h = harness({ reply: call => call.path === "/api/documents" && ++uploads === uploadNumber ? { status: 201, body: { id: 777 } } : undefined });
    expect((await run(h)).code).toBe(1);
    expect(h.requests.size).toBe(uploadNumber - 1);
    expect(h.remaining()).toEqual([]);
  });

  it.each(["domain", "coverage"])("remembers a successful create id despite malformed %s", async field => {
    const h = harness({ reply: (call, response) => call.path === "/api/company-referrals" ? {
      ...response, body: { ...(response.body as object), [field === "domain" ? "companyDomain" : "coverageStatus"]: "invalid-private-value" },
    } : undefined });
    expect((await run(h)).code).toBe(1);
    expect(posts(h).some(call => call.path.endsWith("/claim"))).toBe(false);
    expect(h.remaining()).toEqual([]);
    expect(everything(h)).not.toContain("invalid-private-value");
  });

  it.each(["status", "missing-id", "throw"])("does not call an uncertain create clean: %s", async fault => {
    const h = harness({ reply: (call, response) => {
      if (call.path !== "/api/company-referrals") return;
      if (fault === "throw") throw new Error("Create transport disconnected");
      return fault === "status" ? { ...response, status: 503 } : { status: 201, body: {} };
    } });
    const { code, summary } = await run(h);
    expect(code).toBe(1);
    expect(posts(h).some(call => call.path.endsWith("/claim"))).toBe(false);
    expect(summary.uncertainCreates).toBeGreaterThan(0);
  });

  it.each(["claim-status", "claim-body", "accept-status", "accept-body", "decline-status", "decline-body"])("rejects %s and performs only recovery afterwards", async fault => {
    let failedAt = -1, applied = false;
    const h = harness({ reply: (call, response) => {
      const matches = fault.startsWith("claim") ? call.path.endsWith("/claim") : review(call, fault.startsWith("accept") ? "approved" : "declined");
      if (!matches || applied) return;
      applied = true; failedAt = h.calls.length;
      return fault.endsWith("status") ? { ...response, status: 503 } : { status: 200, body: fault.startsWith("decline") ? { status: "declined" } : {} };
    } });
    expect((await run(h)).code).toBe(1);
    expect(applied).toBe(true);
    const later = mutations(h.calls.slice(failedAt));
    expect(later.every(call => call.path.endsWith("/withdraw") || call.path.endsWith("/step-back") || review(call, "declined"))).toBe(true);
    expect(h.remaining()).toEqual([]);
  });

  it("withdraws a leaked preview without claiming it and writes evidence only after cleanup", async () => {
    const h = harness({ reply: call => call.role === "referrer" && call.path.endsWith("/preview") ? {
      status: 200, body: { request: { id: 9001, candidateName: PRIVATE.name, attachments: [{ id: 501, fileName: "secret-resume-name.png", url: "/api/documents/501" }] } },
    } : undefined });
    expect((await run(h)).code).toBe(1);
    expect(posts(h).some(call => call.path.endsWith("/claim"))).toBe(false);
    expect(h.remaining()).toEqual([]);
    expect(h.writes.every(write => write.remaining.length === 0)).toBe(true);
    expect(everything(h)).not.toContain(PRIVATE.name);
    expect(everything(h)).not.toContain("secret-resume-name.png");
  });

  it.each(["pending", "approved"] as const)("cleans a failure in %s state using the matching detail, never another claim", async status => {
    let broken = false;
    const h = harness({ reply: (call, response) => {
      if (broken || call.role !== "referrer" || call.method !== "GET" || call.path !== "/api/company-referrals/9001") return;
      if (h.requests.get(9001)?.status !== status) return;
      broken = true;
      return { ...response, body: { request: { id: 9001, status, ...(status === "pending" ? { candidateName: PRIVATE.name } : {}), attachments: [] } } };
    } });
    expect((await run(h)).code).toBe(1);
    expect(broken).toBe(true);
    expect(posts(h).filter(call => call.path.endsWith("/claim"))).toHaveLength(1);
    expect(posts(h).some(call => status === "approved" ? call.path.endsWith("/step-back") : review(call, "declined"))).toBe(true);
    expect(h.remaining()).toEqual([]);
  });
  it.each(["/api/credits/summary", "/api/company-referrals/inbox", "/api/company-referrals/9001/preview"])("rejects non-200 read %s even with a valid body", async endpoint => {
    const h = harness({ reply: (call, reply) => call.path.startsWith(endpoint) ? { ...reply, status: 503 } : undefined });
    expect((await run(h)).code).toBe(1);
    expect(posts(h).some(call => review(call, "approved"))).toBe(false);
    expect(h.remaining()).toEqual([]);
  });

  it.each(["seeker-status", "seeker-code", "nonowner-withdraw", "document-before", "document-after-stepback"])("requires real cross-role and document denial: %s", async fault => {
    const h = harness({ reply: (call, reply) => {
      if (fault.startsWith("seeker") && call.role === "seeker" && call.method === "GET" && call.path === "/api/company-referrals/9001") {
        return fault === "seeker-status" ? { ...reply, status: 404 } : { status: 403, body: { code: "unrelated_error" } };
      }
      if (fault === "nonowner-withdraw" && call.role === "referrer" && call.path.endsWith("/withdraw")) return { status: 200, body: { withdrawn: true } };
      if (call.path !== "/api/documents/501" || call.method !== "GET" || !fault.startsWith("document")) return;
      const row = h.requests.get(9001);
      const steppedBack = h.calls.some(previous => previous.path.endsWith("/step-back"));
      if (row?.status === "pending" && (fault === "document-before" ? !steppedBack : steppedBack)) return { status: 200 };
    } });
    expect((await run(h)).code).toBe(1);
    expect(h.remaining()).toEqual([]);
  });

  it("refuses a revealed file that is not the exact uploaded document", async () => {
    const h = harness({ reply: call => call.path === "/api/company-referrals/9001" && h.requests.get(9001)?.status === "approved" ? {
      status: 200, body: { request: { id: 9001, status: "approved", candidateName: PRIVATE.name, attachments: [{ id: 999, fileName: "other-resume.png", url: "/api/documents/999" }] } },
    } : undefined });
    expect((await run(h)).code).toBe(1);
    expect(h.calls.some(call => call.path === "/api/documents/999")).toBe(false);
    expect(h.remaining()).toEqual([]);
  });

  it("does not recover through a mismatched cleanup detail id", async () => {
    const h = harness({ reply: call => {
      if (call.path.endsWith("/claim")) return { status: 200, body: {} };
      if (call.path === "/api/company-referrals/9001") return { status: 200, body: { request: { id: 9009, status: "pending" } } };
    } });
    const { code, summary } = await run(h);
    expect(code).toBe(1);
    expect(posts(h).some(call => review(call, "declined") || call.path.endsWith("/step-back"))).toBe(false);
    expect(summary.remainingRequests).toContain(9001);
  });

  it("records a failed withdrawal and the remaining request instead of reporting clean", async () => {
    const h = harness({ reply: call => {
      if (call.path.endsWith("/preview")) return { status: 500 };
      if (call.role === "seeker" && call.path.endsWith("/withdraw")) {
        const row = h.requests.get(9001);
        if (row) row.withdrawn = false;
        return { status: 503, body: { error: PRIVATE.note } };
      }
    } });
    const { code, summary } = await run(h);
    expect(code).toBe(1);
    expect(h.remaining()).toEqual([9001]);
    expect(summary.steps.some((step: { ok: boolean; name: string }) => !step.ok && /cleanup/.test(step.name))).toBe(true);
    expect(summary.remainingRequests).toContain(9001);
    expect(everything(h)).not.toContain(PRIVATE.note);
  });

  it.each(["http", "page", "console", "client", "navigation", "throw"])("fails a %s capture and still cleans requests", async fault => {
    const h = harness({ capture: (_call, capture) => {
      if (fault === "throw") throw new Error("Capture disconnected");
      if (fault === "http") return { ...capture, status: 500 };
      if (fault === "navigation") return { ...capture, navigationError: "Navigation failed" };
      return { ...capture, [fault === "page" ? "pageErrors" : fault === "console" ? "consoleErrors" : "clientErrors"]: ["Fixture browser failure"] };
    } });
    expect((await run(h)).code).toBe(1);
    expect(h.remaining()).toEqual([]);
  });

  // Run 46084378112: the accepted page rendered correctly, but loadThread (client/src/lib/threadApi.ts) asks
  // /preview before the claimed detail, and once the referrer has claimed the request that probe answers 404 by
  // design (server/privateReferralRoutes.ts). Only that one request, on this run's own accepted conversation, and
  // its one browser console line are expected; every other error still fails the capture.
  const PROBE_CONSOLE = "Failed to load resource: the server responded with a status of 404 ()";
  const withProbe = (id: number, extra: { client?: string[]; console?: string[] } = {}) => harness({ capture: (call, capture) =>
    call.path === `/conversation/${id}` ? { ...capture, clientErrors: [`404 GET /api/company-referrals/${id}/preview`, ...(extra.client ?? [])], consoleErrors: [PROBE_CONSOLE, ...(extra.console ?? [])] } : capture });

  it("accepts only the by-design /preview probe on the run's own accepted conversation, and says so", async () => {
    const h = withProbe(9001);
    const { code, summary } = await run(h);
    expect(code).toBe(0);
    for (const width of [1280, 390]) {
      const step = summary.steps.find((entry: { name: string }) => entry.name === `accepted-${width}`);
      expect(step.ok).toBe(true);
      expect(step.detail).toContain("expected /preview probe");
    }
    expect(h.remaining()).toEqual([]);
  });

  it.each([
    ["another 4xx", { client: ["403 GET /api/company-referrals/9001/conversation"] }],
    ["a second console error", { console: ["Uncaught render failure"] }],
  ])("still fails the accepted capture with the probe plus %s, and names it", async (_label, extra) => {
    const h = withProbe(9001, extra);
    const { code, summary } = await run(h);
    expect(code).toBe(1);
    const step = summary.steps.find((entry: { name: string }) => entry.name === "accepted-1280");
    expect(step.ok).toBe(false);
    if (extra.client) expect(step.detail).toContain("403 GET /api/company-referrals/9001/conversation");
    else expect(step.detail).toContain("1 console error");
    expect(h.remaining()).toEqual([]);
  });

  it("does not accept the probe for a different request or on the queue page", async () => {
    for (const h of [
      harness({ capture: (call, capture) => call.path === "/conversation/9001" ? { ...capture, clientErrors: ["404 GET /api/company-referrals/9002/preview"], consoleErrors: [PROBE_CONSOLE] } : capture }),
      harness({ capture: (call, capture) => call.path === "/queue" ? { ...capture, clientErrors: ["404 GET /api/company-referrals/9001/preview"], consoleErrors: [PROBE_CONSOLE] } : capture }),
    ]) {
      expect((await run(h)).code).toBe(1);
      expect(h.remaining()).toEqual([]);
    }
  });

  it("never accepts a console 404 line without the probe request itself", async () => {
    const h = harness({ capture: (call, capture) => call.path === "/conversation/9001" ? { ...capture, consoleErrors: [PROBE_CONSOLE] } : capture });
    expect((await run(h)).code).toBe(1);
  });

  it.each(["duplicate-debit", "wrong-key", "missing-refund", "decline-refund"])("rejects a defective keyed ledger: %s", async fault => {
    const h = harness({ ledger: rows => {
      if (fault === "duplicate-debit") return [...rows, { ...rows[0], id: 99999 }];
      if (fault === "wrong-key") return rows.map(row => row.id === 90010 ? { ...row, reference: { ...row.reference, id: "9001" } } : row);
      if (fault === "missing-refund") return rows.filter(row => row.reference.id !== "9002#refund#1");
      return [...rows, { ...rows[1], id: 99999, reference: { type: "referral_request", id: "9003#refund#1" } }];
    } });
    expect((await run(h)).code).toBe(1);
    expect(h.remaining()).toEqual([]);
  });

  it("retains only sanitized proof, not successful private response payloads", async () => {
    const h = harness();
    const { code, summary } = await run(h);
    expect(code).toBe(0);
    const artifacts = `${everything(h)}\n${JSON.stringify(summary)}`;
    for (const value of [...Object.values(PRIVATE), ...Object.values(PASSWORDS)]) expect(artifacts).not.toContain(value);
    expect(artifacts).not.toContain('"candidateMessage"');
    expect(artifacts).not.toContain('"attachments"');
    expect(artifacts).toContain("9001#1");
  });

  it("redacts passwords even when sign-in echoes them", async () => {
    const h = harness({ reply: call => call.method === "SIGNIN" ? { status: 401, body: { error: `refused ${PASSWORDS.seeker} ${PASSWORDS.referrer}` } } : undefined });
    expect((await run(h)).code).toBe(1);
    for (const password of Object.values(PASSWORDS)) expect(everything(h)).not.toContain(password);
    expect(posts(h)).toEqual([]);
  });
});

// Safety stops before any state change (restored from the pre-sandbox suite, rewritten for the sandbox harness):
// the journey mutates production state, so each refusal must happen before a single POST.
describe("safety stops before any state change", () => {
  it("fails before any call when a password secret is missing, and says nothing was changed", async () => {
    for (const passwords of [{ ...PASSWORDS, seeker: "" }, { ...PASSWORDS, referrer: "" }]) {
      const h = harness();
      const { code, summary } = await run(h, { passwords });
      expect(code).toBe(1);
      expect(summary).toBeNull();
      expect(h.calls).toEqual([]);
      expect(h.lines.join("\n")).toContain("nothing was changed");
    }
  });

  it("runs only on a manual dispatch, never after a release, on a schedule or a push", async () => {
    for (const trigger of ["workflow_run", "schedule", "push", ""]) {
      const h = harness();
      const { code, summary } = await run(h, { trigger });
      expect(code).toBe(1);
      expect(summary).toBeNull();
      expect(h.calls).toEqual([]);
    }
  });

  it("stops before any mutation when a signed-in account is not the demo account for its role", async () => {
    for (const role of ["seeker", "referrer"] as const) {
      const h = harness({ identity: other => (other === role ? "someone@example.com" : DEMO[other]) });
      const { code, summary } = await run(h);
      expect(code).toBe(1);
      expect(posts(h)).toEqual([]);
      expect(h.requests.size).toBe(0);
      expect(summary?.steps.find(step => step.name === `identity-${role}`)?.ok).toBe(false);
    }
  });

  it("stops without buying or sending when the demo seeker has no free referral", async () => {
    const h = harness({ wallet: { monthlyCreditsRemaining: 0, totalAvailable: 0, ledger: { balance: 0 } } });
    const { code, summary } = await run(h);
    expect(code).toBe(1);
    expect(posts(h)).toEqual([]);
    expect(h.calls.some(call => /checkout|chargebee|billing|plans/.test(call.path))).toBe(false);
    expect(summary?.steps.find(step => step.name === "wallet-before")?.ok).toBe(false);
  });
});

describe("mode input", () => {
  it("parses the mode input and refuses anything else", () => {
    expect(parseMode(undefined)).toBe("navigate");
    expect(parseMode("")).toBe("navigate");
    expect(parseMode("navigate")).toBe("navigate");
    expect(parseMode("journeys")).toBe("journeys");
    expect(() => parseMode("buy")).toThrow(/navigate or journeys/);
  });
});

// Restored verbatim from the pre-sandbox suite: the workflow file is unchanged, and these pins keep the journeys
// mode manual-only, one run at a time and masked.
const WORKFLOW = readFileSync(path.join(path.resolve(__dirname, ".."), ".github/workflows/live-qa.yml"), "utf8");
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
