#!/usr/bin/env node
// OPS-live-qa-journeys (D-389, packet docs/plans/OPS-live-qa-journeys.md): the signed-in journeys mode proves the
// wallet, document privacy and the send/claim/accept/withdraw rules on https://skipwait.me with the two demo
// accounts only. Manual dispatch only: never a payment, checkout, provider call, admin route or non-demo account.
//
// It proves three sandbox requests using only the demo accounts. Every mutation rechecks its actor, every
// result is validated before use, and failures clean up only requests created by this run. Evidence is
// limited to release SHAs, numeric request ids, keyed ledger rows and 1280/390 captures.
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readGitCommitMeta } from "./releaseSmokeCore.mjs";
import { ACCOUNTS, ORIGIN, redactor, signInMessage } from "./live-qa-signed-in.mjs";
import {
  SANDBOX_COMPANY, claimProblems, createdRequest, directoryCompany, freeWallet,
  identityProblem, ledgerEntries, ledgerFor, moneyProblems, privacyProblems, revealProblems,
  transitionProblems, trpcJson, uploadedAttachment,
} from "./liveQaJourneyContracts.mjs";
import { createJourneyClientFactory } from "./liveQaJourneyBrowser.mjs";

/** A reviewed public listing (shared/referralUrl.ts) the job-link preview resolves without fetching a page. */
export const JOB_LINK_FIXTURE = "https://wellfound.com/jobs/3971835-account-executive";
export const JOB_LINK_COMPANY = "chatfin.ai";

/** The journey never uses purchased or promotional allowance. */
export const MIN_CREDITS = 1;

/** A 70-byte 1x1 PNG: a real, valid resume file the demo seeker may attach. */
export const RESUME = Object.freeze({
  fileName: "qa-demo-resume.png",
  mimeType: "image/png",
  dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
});

const NAV_TIMEOUT_MS = 30_000;

/** The workflow's `mode` input: navigate (default) or journeys. */
export function parseMode(value) {
  const v = value || "navigate";
  if (v === "navigate" || v === "journeys") return v;
  throw new Error(`mode must be navigate or journeys, not "${v}"`);
}


export function exitCodeOf(steps) {
  return steps.some(step => !step.ok) ? 1 : 0;
}

const short = sha => (typeof sha === "string" && sha ? sha.slice(0, 8) : "unknown");
const cell = text => String(text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 120);

export function markdownOf(summary) {
  const rows = ["## Live QA journeys (signed in, demo accounts)", "", `Origin ${summary.origin} · API \`${short(summary.release.api)}\` · web \`${short(summary.release.web)}\``, "",
    "| Step | Result | Detail |", "|---|---|---|"];
  for (const step of summary.steps) rows.push(`| ${step.name} | ${step.ok ? "ok" : "FAIL"} | ${cell(step.detail)} |`);
  if (summary.captures.length) rows.push("", `Captures: ${summary.captures.map(capture => `\`${capture.capture}\``).join(", ")}`);
  return `${rows.join("\n")}\n`;
}

async function releaseOf(fetchText) {
  const release = { api: null, web: null };
  try {
    const health = JSON.parse(await fetchText(`${ORIGIN}/api/health/ready`));
    if (health.ok === true && health.state === "ready" && /^[a-f0-9]{40}$/.test(health.commitSha)) release.api = health.commitSha;
  } catch { /* The release step refuses an unknown or unready API. */ }
  try { release.web = readGitCommitMeta(await fetchText(`${ORIGIN}/`)); } catch { /* The release step refuses an unknown web SHA. */ }
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
  if (trigger !== "workflow_dispatch" || missing.length) {
    say(`::error::${missing.length ? `${missing.join(" and ")} not set` : "journeys require workflow_dispatch"}; nothing was changed`);
    return { code: 1, summary: null };
  }
  const summary = { origin: ORIGIN, mode: "journeys", release: await releaseOf(fetchText), steps: [], captures: [], requests: {}, ledger: {}, remainingRequests: [], uncertainCreates: 0 };
  const step = (name, ok, detail = "") => {
    summary.steps.push({ name, ok, detail: redact(detail) });
    say(`${name}: ${ok ? "ok" : "FAIL"}${detail ? ` — ${detail}` : ""}`);
    return ok;
  };
  const requireStep = (name, ok, detail = "") => {
    if (!step(name, ok, detail)) throw new Error("journey step failed");
  };
  const clients = { seeker: clientFor("seeker"), referrer: clientFor("referrer") };
  const remaining = new Set();
  const identity = async role => {
    const reply = await clients[role].me();
    return reply.status === 200 && identityProblem(role, trpcJson(reply.body)?.email) === null;
  };
  const post = async (role, target, body, headers) => {
    if (!await identity(role)) {
      step("identity-before-mutation", false, `${role} identity could not be verified; mutation refused`);
      throw new Error("demo identity changed");
    }
    return clients[role].post(target, body, headers);
  };
  const transition = async (name, role, id, action, kind, body) => {
    const reply = await post(role, `/api/company-referrals/${id}/${action}`, body);
    requireStep(name, transitionProblems(reply, kind).length === 0, `HTTP ${reply.status}`);
    if (kind === "withdrawn") remaining.delete(id);
  };
  const capture = async (target, name) => {
    for (const width of [1280, 390]) {
      const result = await clients.referrer.capture(target, width);
      const ok = result.status === 200 && Boolean(result.capture) && !result.navigationError
        && [result.pageErrors, result.consoleErrors, result.clientErrors].every(errors => Array.isArray(errors) && errors.length === 0);
      summary.captures.push({ capture: result.capture, width, status: result.status, ok });
      requireStep(`${name}-${width}`, ok, `HTTP ${result.status}; ${ok ? "captured" : "capture failed"}`);
    }
  };
  const create = async (name, offset, note) => {
    const upload = await post("seeker", "/api/documents", RESUME);
    const attachmentId = uploadedAttachment(upload);
    requireStep(`document-${name}`, attachmentId !== null, `HTTP ${upload.status}`);
    let reply;
    try {
      reply = await post("seeker", "/api/company-referrals", {
        companySlug: SANDBOX_COMPANY.slug, targetRoleUrl: SANDBOX_COMPANY.jobUrl,
        attachmentIds: [attachmentId], candidateMessage: note,
      }, { "Idempotency-Key": idempotencyKey(now + offset) });
    } catch {
      summary.uncertainCreates += 1;
      throw new Error("creation response unavailable");
    }
    const id = reply.body?.requestId;
    const knownId = [200, 201].includes(reply.status) && Number.isSafeInteger(id) && id > 0;
    if (knownId) remaining.add(id);
    else if ([200, 201].includes(reply.status) || reply.status >= 500) summary.uncertainCreates += 1;
    const created = createdRequest(reply);
    requireStep(`create-${name}`, created !== null, `HTTP ${reply.status}`);
    summary.requests[name] = created.requestId;
    return { id: created.requestId, attachmentId };
  };
  const claim = async (name, id) => {
    const reply = await post("referrer", `/api/company-referrals/${id}/claim`);
    requireStep(name, claimProblems(reply, id).length === 0, `HTTP ${reply.status}`);
  };
  const locked = async (target, name, id) => {
    const reply = await clients.referrer.get(target);
    requireStep(name, reply.status === 200 && reply.body?.request?.id === id && privacyProblems(reply.body).length === 0, `HTTP ${reply.status}; locked metadata required`);
  };
  const denyDocument = async (attachmentId, name) => {
    const reply = await clients.referrer.get(`/api/documents/${attachmentId}`);
    requireStep(name, reply.status === 404, `HTTP ${reply.status}`);
  };
  try {
    requireStep("release", Boolean(summary.release.api) && /^[a-f0-9]{40}$/.test(summary.release.web ?? ""), "exact ready API and web SHAs required");
    for (const role of ["seeker", "referrer"]) {
      const reply = await clients[role].signIn(passwords[role]);
      requireStep(`identity-${role}`, reply.status === 200 && await identity(role), signInMessage(reply.status));
    }
    const wallet = await clients.seeker.get("/api/credits/summary");
    const before = wallet.status === 200 ? freeWallet(wallet.body) : null;
    requireStep("wallet-before", before !== null && before.free >= MIN_CREDITS, "free-only allowance required; no purchase was attempted");
    const directory = await clients.seeker.get(`/api/companies/${SANDBOX_COMPANY.slug}`);
    requireStep("route", directory.status === 200 && directoryCompany(directory.body) !== null, "validated sandbox company required");

    const ask = await create("ask", 0, "QA demo request: privacy and acceptance check, withdrawn by this run.");
    const inbox = await clients.referrer.get("/api/company-referrals/inbox?scope=new");
    requireStep("inbox", inbox.status === 200 && Array.isArray(inbox.body?.requests) && inbox.body.requests.some(row => row.id === ask.id), `HTTP ${inbox.status}`);
    await locked(`/api/company-referrals/${ask.id}/preview`, "preview-privacy", ask.id);
    await capture("/queue", "queue");
    await denyDocument(ask.attachmentId, "document-denied");
    await claim("claim", ask.id);
    await locked(`/api/company-referrals/${ask.id}`, "claimed-privacy", ask.id);
    await denyDocument(ask.attachmentId, "claimed-document-denied");
    await transition("accept", "referrer", ask.id, "one-click-review", "accepted", { decision: "approved", ethicsConfirmed: true });
    const detail = await clients.referrer.get(`/api/company-referrals/${ask.id}`);
    const fileMatches = detail.body?.request?.attachments?.some(file => file.id === ask.attachmentId && file.url === `/api/documents/${ask.attachmentId}`);
    requireStep("reveal", detail.status === 200 && detail.body?.request?.id === ask.id && revealProblems(detail.body).length === 0 && fileMatches === true, `HTTP ${detail.status}; accepted upload required`);
    const opened = await clients.referrer.get(`/api/documents/${ask.attachmentId}`);
    requireStep("document-open", opened.status === 200, `HTTP ${opened.status}`);
    await capture(`/conversation/${ask.id}`, "accepted");
    for (const suffix of ["", "/preview"]) {
      const denied = await clients.seeker.get(`/api/company-referrals/${ask.id}${suffix}`);
      requireStep(`cross-role-denied${suffix}`, denied.status === 403 && denied.body?.code === "work_email_code_required", `HTTP ${denied.status}`);
    }
    const nonowner = await post("referrer", `/api/company-referrals/${ask.id}/withdraw`);
    requireStep("nonowner-withdraw-denied", nonowner.status === 404, `HTTP ${nonowner.status}`);
    await transition("step-back", "referrer", ask.id, "step-back", "steppedBack");
    await denyDocument(ask.attachmentId, "released-document-denied");
    await transition("withdraw-accepted", "seeker", ask.id, "withdraw", "withdrawn");

    const withdrawn = await create("withdrawn", 1, "QA demo request: withdrawn before pickup by this run.");
    await transition("withdraw-before-pickup", "seeker", withdrawn.id, "withdraw", "withdrawn");
    const declined = await create("declined", 2, "QA demo request: claimed and declined only by the demo referrer.");
    await claim("claim-decline", declined.id);
    await transition("decline", "referrer", declined.id, "one-click-review", "passed", { decision: "declined", declineReason: "cannot_support" });
    await transition("withdraw-declined", "seeker", declined.id, "withdraw", "withdrawn");

    const ledgerReply = await clients.seeker.get("/api/credits/ledger?role=job_seeker&limit=50");
    const entries = ledgerReply.status === 200 ? ledgerEntries(ledgerReply.body) : null;
    requireStep("ledger", entries !== null && [ask.id, withdrawn.id, declined.id].every(id => moneyProblems({ requestId: id, entries, expect: { spend: true, refund: id !== declined.id } }).length === 0), "one cycle debit per request; refunds only after pre-pickup withdrawal or released acceptance");
    for (const id of [ask.id, withdrawn.id, declined.id]) {
      const legs = ledgerFor(entries, id);
      summary.ledger[id] = [...legs.spend, ...legs.refund].map(row => ({ id: row.id, kind: row.kind, credits: row.credits, bucket: row.bucket, reference: row.reference }));
    }
    const afterReply = await clients.seeker.get("/api/credits/summary");
    requireStep("wallet-after", afterReply.status === 200 && freeWallet(afterReply.body) !== null, "consistent free-only wallet required; sandbox top-ups prevent aggregate-delta proof");
    const link = await post("seeker", "/api/job-link/preview", { url: JOB_LINK_FIXTURE });
    requireStep("job-link", link.status === 200 && link.body?.companyDomain === JOB_LINK_COMPANY && link.body?.status === "fresh", `HTTP ${link.status}`);
    const finalRelease = await releaseOf(fetchText);
    requireStep("release-stable", finalRelease.api === summary.release.api && finalRelease.web === summary.release.web, "web/API releases must remain unchanged during the journey");
  } catch {
    if (summary.steps.every(result => result.ok)) step("execution", false, "journey stopped; no unvalidated response was accepted");
  } finally {
    for (const id of remaining) {
      try {
        let reply = await post("seeker", `/api/company-referrals/${id}/withdraw`);
        if (reply.status === 409) {
          const detail = await clients.referrer.get(`/api/company-referrals/${id}`);
          const state = detail.status === 200 && detail.body?.request?.id === id ? detail.body.request.status : null;
          if (state === "approved") {
            await transition(`cleanup-step-back-${id}`, "referrer", id, "step-back", "steppedBack");
          } else if (state === "pending") {
            await transition(`cleanup-pass-${id}`, "referrer", id, "one-click-review", "passed", { decision: "declined", declineReason: "cannot_support" });
          } else throw new Error("cleanup state unavailable");
          reply = await post("seeker", `/api/company-referrals/${id}/withdraw`);
        }
        if (transitionProblems(reply, "withdrawn").length) throw new Error("cleanup withdrawal failed");
        remaining.delete(id);
      } catch { step(`cleanup-${id}`, false, `request ${id} remains unverified; no other request was touched`); }
    }
    summary.remainingRequests = [...remaining];
    step("cleanup", remaining.size === 0 && summary.uncertainCreates === 0, `${remaining.size} known requests remain; ${summary.uncertainCreates} uncertain creates`);
  }
  await makeDir(outDir, { recursive: true });
  await write(path.join(outDir, "summary.json"), redact(JSON.stringify(summary, null, 2)));
  await appendSummary(redact(markdownOf(summary)));
  if (summary.release.web) await setOutput(`web_sha=${summary.release.web}`);
  return { code: exitCodeOf(summary.steps), summary };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const passwords = { seeker: process.env.REVIEWER_SEEKER_PASSWORD ?? "", referrer: process.env.REVIEWER_REFERRER_PASSWORD ?? "" };
  const redact = redactor(Object.values(passwords));
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const { code } = await runJourneys({
        passwords, trigger: process.env.LIVE_QA_TRIGGER ?? "",
        clientFor: createJourneyClientFactory({ browser, redact }),
        fetchText: async url => (await fetch(url, { signal: AbortSignal.timeout(NAV_TIMEOUT_MS), headers: { "cache-control": "no-cache" } })).text(),
        mkdir: (p, o) => mkdir(p, o), writeFile: (p, text) => writeFile(p, text),
        appendSummary: text => process.env.GITHUB_STEP_SUMMARY ? appendFile(process.env.GITHUB_STEP_SUMMARY, text) : Promise.resolve(),
        setOutput: text => process.env.GITHUB_OUTPUT ? appendFile(process.env.GITHUB_OUTPUT, `${text}\n`) : Promise.resolve(),
        log: line => console.log(line), outDir: "live-qa",
      });
      process.exitCode = code;
    } finally { await browser.close(); }
  } catch {
    console.error("live-qa-journeys: execution failed; inspect the redacted step summary");
    process.exitCode = 1;
  }
}
