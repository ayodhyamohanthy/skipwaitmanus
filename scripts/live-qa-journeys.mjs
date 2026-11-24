#!/usr/bin/env node
// OPS-live-qa-journeys (D-389, packet docs/plans/OPS-live-qa-journeys.md): the signed-in journeys mode proves the
// wallet, document privacy and the send/claim/accept/withdraw rules on https://skipwait.me with the two demo
// accounts only. Manual dispatch only: never a payment, checkout, provider call, admin route or non-demo account.
//
// It signs in once per demo account, routes one ask to the demo referrer's own company, and records every step's
// status code and the redacted fields the packet names. Output: live-qa/<role>/*.png, live-qa/summary.json and a
// Markdown table in the step summary. Exit 1 when a secret is missing, an identity is not the demo account, the
// wallet has no free referral, or any step fails; 0 otherwise.
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readGitCommitMeta } from "./releaseSmokeCore.mjs";
import { ACCOUNTS, ORIGIN, redactor, signInMessage } from "./live-qa-signed-in.mjs";

/** The two public demo accounts (server/_core/reviewerLogin.ts). Nothing else may sign in here. */
export const DEMO = Object.freeze({ seeker: ACCOUNTS.seeker.email, referrer: ACCOUNTS.referrer.email });

/** The demo referrer's verified work-email domain: the only company this run may route an ask to. */
export const DEMO_COMPANY_DOMAIN = "reviewer.skipwait.me";

/** The walk-in post the demo referrer publishes when it has none live, so the ask has a route to its company. */
export const QA_ROLE_TITLE = "QA demo role (automatic check, removed after the run)";

/** A reviewed public listing (shared/referralUrl.ts) the job-link preview resolves without fetching a page. */
export const JOB_LINK_FIXTURE = "https://wellfound.com/jobs/3971835-account-executive";
export const JOB_LINK_COMPANY = "chatfin.ai";

/** One credit is consumed per run: the declined ask stays spent; the two closed asks return theirs. */
export const MIN_CREDITS = 1;

/** A 70-byte 1x1 PNG: a real, valid resume file the demo seeker may attach. */
export const RESUME = Object.freeze({
  fileName: "qa-demo-resume.png",
  mimeType: "image/png",
  dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
});

const NAV_TIMEOUT_MS = 30_000, QUIET_TIMEOUT_MS = 10_000, MAX_LINE = 300;

/** The workflow's `mode` input: navigate (default) or journeys. */
export function parseMode(value) {
  const v = value || "navigate";
  if (v === "navigate" || v === "journeys") return v;
  throw new Error(`mode must be navigate or journeys, not "${v}"`);
}

/** Fail closed unless the signed-in account is exactly the demo account for its role. */
export function identityProblem(role, email) {
  const expected = DEMO[role];
  if (!expected) return `unknown role ${role}`;
  if (typeof email !== "string" || email.trim().toLowerCase() !== expected) return `${role} signed in as ${email || "nobody"}, not ${expected}`;
  return null;
}

/** tRPC answers a superjson envelope (a batch is an array); read the plain value out of either shape. */
export function trpcJson(body) {
  const one = Array.isArray(body) ? body[0] : body;
  const data = one?.result?.data;
  if (data && typeof data === "object" && "json" in data) return data.json;
  return data ?? null;
}

/** The wallet's spendable total from GET /api/credits/summary, or null when the answer is not a count. */
export function walletTotal(body) {
  const total = body?.summary?.totalAvailable;
  return typeof total === "number" && Number.isInteger(total) && total >= 0 ? total : null;
}

/** The ledger rows that belong to one referral request: its spend and any withdrawal refund. */
export function ledgerFor(entries, requestId) {
  const id = String(requestId);
  const rows = (Array.isArray(entries) ? entries : []).filter(entry => entry?.reference?.type === "referral_request" && entry?.reference?.id === id);
  return { spend: rows.filter(entry => entry.credits < 0), refund: rows.filter(entry => entry.credits > 0 && entry.kind === "withdrawal_refund") };
}

/**
 * The money rules the packet names, checked against one request's ledger rows and the wallet:
 * D-034 (a covered ask is charged once), D-147 (a decline keeps it spent) and the pre-pickup return.
 */
export function moneyProblems({ before, after, requestId, entries, expect }) {
  const problems = [];
  const { spend, refund } = ledgerFor(entries, requestId);
  if (expect.spend && spend.length === 0) problems.push(`no spend row for request ${requestId}`);
  if (expect.spend && spend.some(row => row.credits !== -1)) problems.push(`the spend row for request ${requestId} is not -1`);
  if (expect.refund && refund.length === 0) problems.push(`no withdrawal refund row for request ${requestId}`);
  if (expect.refund && refund.some(row => row.credits !== 1)) problems.push(`the refund row for request ${requestId} is not +1`);
  if (!expect.refund && refund.length > 0) problems.push(`request ${requestId} was refunded but must stay spent`);
  if (typeof before === "number" && typeof after === "number" && after - before !== expect.walletDelta) problems.push(`wallet moved ${after - before}, expected ${expect.walletDelta}`);
  return problems;
}

/** Before acceptance the referrer sees no seeker name and no file name, id or link (D-019(e)). */
export function privacyProblems(preview) {
  const request = preview?.request;
  if (!request) return ["no preview"];
  const problems = [];
  if ("candidateName" in request) problems.push("the preview names the seeker");
  for (const file of request.attachments ?? []) {
    if ("fileName" in file || "url" in file || "id" in file) problems.push("the preview opens a file");
  }
  return problems;
}

/** After the referrer's own acceptance the name and the files open. */
export function revealProblems(detail) {
  const request = detail?.request;
  if (!request) return ["no accepted detail"];
  const problems = [];
  if (typeof request.candidateName !== "string" || !request.candidateName) problems.push("the accepted detail has no candidate name");
  const files = request.attachments ?? [];
  if (!files.length) problems.push("the accepted detail has no files");
  for (const file of files) {
    if (typeof file.fileName !== "string" || !file.fileName) problems.push("an accepted file has no name");
    if (typeof file.url !== "string" || !file.url) problems.push("an accepted file has no link");
  }
  return problems;
}

export function exitCodeOf(steps) {
  return steps.some(step => !step.ok) ? 1 : 0;
}

const short = sha => (typeof sha === "string" && sha ? sha.slice(0, 8) : "unknown");
const cell = text => String(text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 120);
const messageOf = error => (error instanceof Error ? error.message : String(error)).split("\n")[0].slice(0, MAX_LINE);
const pathOf = url => { try { const u = new URL(url); return u.origin === ORIGIN ? u.pathname : `${u.origin}/…`; } catch { return "?"; } };

export function markdownOf(summary) {
  const rows = ["## Live QA journeys (signed in, demo accounts)", "", `Origin ${summary.origin} · API \`${short(summary.release.api)}\` · web \`${short(summary.release.web)}\``, "",
    "| Step | Result | Detail |", "|---|---|---|"];
  for (const step of summary.steps) rows.push(`| ${step.name} | ${step.ok ? "ok" : "FAIL"} | ${cell(step.detail)} |`);
  if (summary.captures.length) rows.push("", `Captures: ${summary.captures.map(capture => `\`${capture.capture}\``).join(", ")}`);
  return `${rows.join("\n")}\n`;
}

async function releaseOf(fetchText) {
  const release = { api: null, web: null };
  try { const health = JSON.parse(await fetchText(`${ORIGIN}/api/health/ready`)); release.api = typeof health.commitSha === "string" ? health.commitSha : null; } catch { /* recorded as unknown */ }
  try { release.web = readGitCommitMeta(await fetchText(`${ORIGIN}/`)); } catch { /* recorded as unknown */ }
  return release;
}

const idempotencyKey = now => `qa-journeys-${now}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * The whole journeys run with its I/O injected: clientFor(role) -> a signed-in client
 * ({ signIn, me, get, post, capture }), fetchText(url), mkdir, writeFile, appendSummary, setOutput, log, outDir.
 * Returns { code, summary } (summary is null when nothing ran).
 */
export async function runJourneys({ passwords, trigger, clientFor, fetchText, mkdir: makeDir, writeFile: write, appendSummary, setOutput, log, outDir, now = Date.now() }) {
  const redact = redactor(Object.values(passwords));
  const say = line => log(redact(line));
  const missing = ["seeker", "referrer"].filter(role => !passwords[role]).map(role => ACCOUNTS[role].secret);
  if (missing.length) {
    say(`::error::${missing.join(" and ")} not set: the owner adds them on Settings > Secrets and variables > Actions (OPS-live-qa-runner section 4); this journeys run (${trigger || "manual"}) checked nothing`);
    return { code: 1, summary: null };
  }
  const steps = [];
  const step = (name, ok, detail = "") => { steps.push({ name, ok, detail: redact(detail) }); say(`${name}: ${ok ? "ok" : "FAIL"}${detail ? ` — ${detail}` : ""}`); return ok; };
  const summary = { origin: ORIGIN, mode: "journeys", release: await releaseOf(fetchText), steps, captures: [], requests: {} };
  const finish = async code => {
    await makeDir(outDir, { recursive: true });
    await write(path.join(outDir, "summary.json"), redact(JSON.stringify(summary, null, 2)));
    await appendSummary(redact(markdownOf(summary)));
    if (summary.release.web) await setOutput(`web_sha=${summary.release.web}`);
    return { code, summary };
  };
  const clients = { seeker: clientFor("seeker"), referrer: clientFor("referrer") };

  // 1. Sign in both demo accounts, then fail closed unless each session is exactly its demo account.
  const signIn = {};
  for (const role of ["seeker", "referrer"]) signIn[role] = await clients[role].signIn(passwords[role]);
  const identity = [];
  for (const role of ["seeker", "referrer"]) {
    if (signIn[role].status !== 200) { identity.push(`${role}: ${signInMessage(signIn[role].status)}${signIn[role].body?.error ? ` (${signIn[role].body.error})` : ""}`); continue; }
    const me = await clients[role].me();
    const problem = identityProblem(role, trpcJson(me.body)?.email);
    if (problem) identity.push(problem);
  }
  if (!step("identity", identity.length === 0, identity.join("; "))) return finish(1);

  // 2. The wallet before: no free referral means stop, never buy and never open checkout.
  const before = walletTotal((await clients.seeker.get("/api/credits/summary")).body);
  const walletDetail = typeof before !== "number" ? "the wallet did not answer" : before === 0 ? "no free referral available; nothing was bought" : before < MIN_CREDITS ? `only ${before} free referral${before === 1 ? "" : "s"} left; this journey needs ${MIN_CREDITS}` : `${before} available`;
  if (!step("wallet-before", typeof before === "number" && before >= MIN_CREDITS, walletDetail)) return finish(1);

  // 3. Route to the demo referrer's own company: reuse its live post, or publish one walk-in post for this run.
  const mine = await clients.referrer.get("/api/opportunities/mine");
  const live = (mine.body?.opportunities ?? []).find(opportunity => opportunity?.companyDomain === DEMO_COMPANY_DOMAIN && Number.isInteger(opportunity?.id) && opportunity?.isActive === true && opportunity?.expired === false);
  let opportunityId = live?.id ?? null;
  let createdOpportunity = false;
  if (!opportunityId) {
    const published = await clients.referrer.post("/api/opportunities", { kind: "walk_in", roleTitle: QA_ROLE_TITLE, location: "Remote", walkInAt: new Date(now).toISOString(), walkInEndsAt: new Date(now + 2 * 3_600_000).toISOString() });
    opportunityId = published.body?.opportunity?.id ?? null;
    createdOpportunity = Boolean(opportunityId);
  }
  if (!step("route", Boolean(opportunityId), opportunityId ? `demo company ${DEMO_COMPANY_DOMAIN} via opportunity ${opportunityId}` : "the demo referrer has no live post and could not publish one")) return finish(1);

  // 4. Upload the resume the ask needs (a real 1x1 PNG in the demo account only).
  const uploaded = await clients.seeker.post("/api/documents", RESUME);
  const attachmentId = uploaded.body?.id ?? null;
  if (!step("document", uploaded.status === 201 && Boolean(attachmentId), attachmentId ? `attachment ${attachmentId}` : `upload answered ${uploaded.status}`)) return finish(1);

  // 5. Send the ask to the demo referrer's company. A covered ask is charged once at first visibility (D-034).
  const create = await clients.seeker.post("/api/company-referrals", { opportunityId, attachmentIds: [attachmentId], candidateMessage: "QA demo request: this checks the referral flow and is withdrawn by the run." }, { "Idempotency-Key": idempotencyKey(now) });
  const requestId = create.body?.requestId ?? null;
  const covered = create.body?.coverageStatus === "covered";
  if (!step("create", create.status === 201 && Boolean(requestId) && covered, requestId ? `request ${requestId}, ${create.body?.coverageStatus}` : `create answered ${create.status}`)) return finish(1);
  summary.requests.ask = requestId;

  // 6. The referrer sees the ask with no seeker name and no file links; capture the queue at both widths.
  const inbox = await clients.referrer.get("/api/company-referrals/inbox?scope=new");
  const visible = (inbox.body?.requests ?? []).some(row => Number(row?.id) === requestId);
  const preview = await clients.referrer.get(`/api/company-referrals/${requestId}/preview`);
  const privacy = [...(visible ? [] : ["the ask is not in the referrer's inbox"]), ...privacyProblems(preview.body)];
  for (const width of [1280, 390]) summary.captures.push(await clients.referrer.capture("/queue", width));
  if (!step("preview-privacy", privacy.length === 0, privacy.join("; "))) return finish(1);

  // 7. Before acceptance the referrer cannot open the seeker's file (D-019(e)).
  const denied = await clients.referrer.get(`/api/documents/${attachmentId}`);
  if (!step("document-denied", denied.status === 404, `document answered ${denied.status}`)) return finish(1);

  // 8. Claim and accept, the confirmed act the server requires.
  const claim = await clients.referrer.post(`/api/company-referrals/${requestId}/claim`);
  if (!step("claim", claim.status === 200, `claim answered ${claim.status}`)) return finish(1);
  const accept = await clients.referrer.post(`/api/company-referrals/${requestId}/one-click-review`, { decision: "approved", ethicsConfirmed: true });
  if (!step("accept", accept.status === 200 && accept.body?.status === "approved", `accept answered ${accept.status}`)) return finish(1);

  // 9. After the referrer's own acceptance the name and files appear, and the file opens.
  const detail = await clients.referrer.get(`/api/company-referrals/${requestId}`);
  const reveal = revealProblems(detail.body);
  const opened = await clients.referrer.get(`/api/documents/${attachmentId}`);
  if (opened.status !== 200) reveal.push(`the accepted file answered ${opened.status}`);
  for (const width of [1280, 390]) summary.captures.push(await clients.referrer.capture(`/conversation/${requestId}`, width));
  if (!step("reveal", reveal.length === 0, reveal.join("; "))) return finish(1);

  // 10. The seeker cannot read the referrer-only views of the same ask.
  const seekerDetail = await clients.seeker.get(`/api/company-referrals/${requestId}`);
  const seekerPreview = await clients.seeker.get(`/api/company-referrals/${requestId}/preview`);
  const cross = [];
  if (seekerDetail.status !== 404) cross.push(`the seeker's claimed-detail read answered ${seekerDetail.status}`);
  if (seekerPreview.status !== 404) cross.push(`the seeker's preview read answered ${seekerPreview.status}`);
  if (!step("cross-role-denied", cross.length === 0, cross.join("; "))) return finish(1);

  // 11. The referrer steps back from the accepted ask, so it reopens and the run can close it; the step-back
  // releases the claim, so the seeker's withdrawal returns the credit (the ask reached no referral).
  const stepBack = await clients.referrer.post(`/api/company-referrals/${requestId}/step-back`);
  if (!step("step-back", stepBack.status === 200 && stepBack.body?.steppedBack === true, `step-back answered ${stepBack.status}`)) return finish(1);
  const acceptedWithdraw = await clients.seeker.post(`/api/company-referrals/${requestId}/withdraw`);
  if (!step("withdraw-accepted", acceptedWithdraw.status === 200, `withdraw answered ${acceptedWithdraw.status}`)) return finish(1);

  // 12. A second ask withdrawn before pickup returns its credit (D-034).
  const secondUpload = await clients.seeker.post("/api/documents", RESUME);
  const secondCreate = await clients.seeker.post("/api/company-referrals", { opportunityId, attachmentIds: [secondUpload.body?.id], candidateMessage: "QA demo request: withdrawn before pickup by the run." }, { "Idempotency-Key": idempotencyKey(now + 1) });
  const secondId = secondCreate.body?.requestId ?? null;
  if (!step("create-withdraw", secondCreate.status === 201 && Boolean(secondId) && secondCreate.body?.coverageStatus === "covered", secondId ? `request ${secondId}` : `create answered ${secondCreate.status}`)) return finish(1);
  summary.requests.withdrawn = secondId;
  const beforePickup = await clients.seeker.post(`/api/company-referrals/${secondId}/withdraw`);
  if (!step("withdraw-before-pickup", beforePickup.status === 200, `withdraw answered ${beforePickup.status}`)) return finish(1);

  // 13. A third ask the referrer claims and declines: the credit stays spent (D-147, D-021), even when the
  // seeker withdraws it afterwards, because the latest pickup is the claim.
  const thirdUpload = await clients.seeker.post("/api/documents", RESUME);
  const thirdCreate = await clients.seeker.post("/api/company-referrals", { opportunityId, attachmentIds: [thirdUpload.body?.id], candidateMessage: "QA demo request: claimed and declined by the demo referrer." }, { "Idempotency-Key": idempotencyKey(now + 2) });
  const thirdId = thirdCreate.body?.requestId ?? null;
  if (!step("create-decline", thirdCreate.status === 201 && Boolean(thirdId) && thirdCreate.body?.coverageStatus === "covered", thirdId ? `request ${thirdId}` : `create answered ${thirdCreate.status}`)) return finish(1);
  summary.requests.declined = thirdId;
  const thirdClaim = await clients.referrer.post(`/api/company-referrals/${thirdId}/claim`);
  if (!step("claim-decline", thirdClaim.status === 200, `claim answered ${thirdClaim.status}`)) return finish(1);
  const decline = await clients.referrer.post(`/api/company-referrals/${thirdId}/one-click-review`, { decision: "declined", declineReason: "role_not_a_fit" });
  if (!step("decline", decline.status === 200 && decline.body?.status === "declined", `decline answered ${decline.status}`)) return finish(1);
  const declinedWithdraw = await clients.seeker.post(`/api/company-referrals/${thirdId}/withdraw`);
  if (!step("withdraw-declined", declinedWithdraw.status === 200, `withdraw answered ${declinedWithdraw.status}`)) return finish(1);

  // 14. The ledger and the wallet after: the two closed asks returned their credit, the declined one stays spent.
  const ledger = await clients.seeker.get("/api/credits/ledger?role=job_seeker&limit=50");
  const after = walletTotal((await clients.seeker.get("/api/credits/summary")).body);
  const entries = ledger.body?.entries;
  const money = [
    ...moneyProblems({ before, after, requestId, entries, expect: { spend: true, refund: true, walletDelta: -MIN_CREDITS } }),
    ...moneyProblems({ before, after, requestId: secondId, entries, expect: { spend: true, refund: true, walletDelta: -MIN_CREDITS } }),
    ...moneyProblems({ before, after, requestId: thirdId, entries, expect: { spend: true, refund: false, walletDelta: -MIN_CREDITS } }),
  ];
  if (!step("ledger", money.length === 0, money.join("; "))) return finish(1);
  if (!step("wallet-after", after === before - MIN_CREDITS, `${before} before, ${after} after`)) return finish(1);

  // 15. One job-link preview for a reviewed public listing.
  const link = await clients.seeker.post("/api/job-link/preview", { url: JOB_LINK_FIXTURE });
  const linkOk = link.status === 200 && link.body?.companyDomain === JOB_LINK_COMPANY;
  if (!step("job-link", linkOk, linkOk ? `${JOB_LINK_FIXTURE} → ${JOB_LINK_COMPANY}` : `preview answered ${link.status}`)) return finish(1);

  // 16. Clean up so the next run starts from the same state.
  if (createdOpportunity) {
    const closed = await clients.referrer.post(`/api/opportunities/${opportunityId}/close`);
    step("cleanup", closed.status === 200, `close answered ${closed.status}`);
  } else {
    step("cleanup", true, "reused a live demo post; nothing to close");
  }

  return finish(exitCodeOf(steps));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const passwords = { seeker: process.env.REVIEWER_SEEKER_PASSWORD ?? "", referrer: process.env.REVIEWER_REFERRER_PASSWORD ?? "" };
  const redact = redactor(Object.values(passwords));
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    const contexts = new Map();
    const contextFor = async role => {
      if (!contexts.has(role)) contexts.set(role, await browser.newContext());
      return contexts.get(role);
    };
    const jsonOf = async response => { try { return await response.json(); } catch { return null; } };
    const clientFor = role => ({
      signIn: async password => {
        const context = await contextFor(role);
        const response = await context.request.post(`${ORIGIN}/api/auth/reviewer/sign-in`, { data: { email: DEMO[role], password }, failOnStatusCode: false, maxRedirects: 0 });
        return { status: response.status(), body: await jsonOf(response) };
      },
      me: async () => {
        const context = await contextFor(role);
        const response = await context.request.get(`${ORIGIN}/api/trpc/auth.me`, { failOnStatusCode: false });
        return { status: response.status(), body: await jsonOf(response) };
      },
      get: async target => {
        const context = await contextFor(role);
        const response = await context.request.get(`${ORIGIN}${target}`, { failOnStatusCode: false });
        return { status: response.status(), body: await jsonOf(response) };
      },
      post: async (target, body, headers) => {
        const context = await contextFor(role);
        const response = await context.request.post(`${ORIGIN}${target}`, { data: body, headers, failOnStatusCode: false });
        return { status: response.status(), body: await jsonOf(response) };
      },
      capture: async (target, width) => {
        const context = await contextFor(role);
        const page = await context.newPage();
        const current = { status: null, title: null, pageErrors: [], consoleErrors: [], clientErrors: [], capture: null, navigationError: null };
        page.on("pageerror", error => current.pageErrors.push(redact(messageOf(error))));
        page.on("console", msg => { if (msg.type() === "error") current.consoleErrors.push(redact(msg.text()).slice(0, MAX_LINE)); });
        page.on("response", res => { if (res.status() >= 400) current.clientErrors.push(redact(`${res.status()} ${res.request().method()} ${pathOf(res.url())}`).slice(0, MAX_LINE)); });
        try {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
          const response = await page.goto(`${ORIGIN}${target}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
          await page.waitForLoadState("networkidle", { timeout: QUIET_TIMEOUT_MS }).catch(() => {});
          current.status = response?.status() ?? null;
          current.title = redact(await page.title());
          const file = path.join("live-qa", role, `${target.replace(/^\//, "").replace(/\//g, "-")}-${width}.png`);
          await page.screenshot({ path: file, fullPage: true });
          current.capture = file;
        } catch (error) {
          current.navigationError = redact(messageOf(error));
        }
        await page.close();
        return current;
      },
    });
    try {
      const { code } = await runJourneys({
        passwords,
        trigger: process.env.LIVE_QA_TRIGGER ?? "",
        clientFor,
        fetchText: async url => (await fetch(url, { signal: AbortSignal.timeout(NAV_TIMEOUT_MS), headers: { "cache-control": "no-cache" } })).text(),
        mkdir: (p, o) => mkdir(p, o),
        writeFile: (p, text) => writeFile(p, text),
        appendSummary: text => (process.env.GITHUB_STEP_SUMMARY ? appendFile(process.env.GITHUB_STEP_SUMMARY, text) : Promise.resolve()),
        setOutput: text => (process.env.GITHUB_OUTPUT ? appendFile(process.env.GITHUB_OUTPUT, `${text}\n`) : Promise.resolve()),
        log: line => console.log(line),
        outDir: "live-qa",
      });
      process.exitCode = code;
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error(`live-qa-journeys: ${redact(messageOf(error))}`);
    process.exitCode = 1;
  }
}
