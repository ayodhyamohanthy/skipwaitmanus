import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const express = require("express");
const { z } = require("zod");

// Local verification only: no app-server imports, proxy, provider or browser calls.
export const SCENARIOS = ["default", "profile", "profile-cleared", "intro-sent", "intro-refused", "unlock-pending", "unlock-confirmed", "unlock-error", "unlock-402", "search", "loading", "empty", "load-error", "retry", "denied", "profile-error"];
const scenarioSchema = z.enum(SCENARIOS);
export const REF_A = "tal_nfAQM_mhMoW-xVAnLby9eKLM";
export const REF_B = "tal_sj50_1A9Gy4ztL3B_o7TbNls";
export const REF_C = "tal_Qw3rTy-uI0pAsDfGhJkLzXcV";
const rows = [
  { displayRef: REF_A, headline: "Backend engineer", location: "Pune", skills: ["Go", "Postgres"], isUnlocked: false },
  { displayRef: REF_B, headline: "Product designer", location: "Remote", skills: ["Figma"], isUnlocked: true },
  { displayRef: REF_C, headline: "Platform engineer", location: "Remote", skills: ["TypeScript"], isUnlocked: false },
];
const person = { id: 79, name: "Synthetic Employer", email: "employer@synthetic.example", role: "user", openId: "synthetic", loginMethod: "fixture" };
const profile = { headline: "Product designer", skills: ["Figma"], experience: "6-10 years", expertise: ["Design systems", "Figma"], unlockedAt: "2026-11-01T10:00:00.000Z", expiresAt: "2026-12-01T10:00:00.000Z" };
export const CSP = "default-src 'none'; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

export async function startTarget(root, phase) {
  assert.ok(isAbsolute(root), "dist/public root must be absolute");
  assert.ok(phase === "baseline" || phase === "candidate", "invalid target phase");
  await access(join(root, "index.html"));
  const app = express();
  const sessions = new Map();
  const cookieName = `sw_ca30_${phase}`; // Cookies share a host across ports; names must differ.
  let sequence = 0;
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({ "Content-Security-Policy": CSP, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Synthetic-Fixture": phase });
    const origin = `http://${req.headers.host}`;
    if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host ?? "") || (req.headers.origin && req.headers.origin !== origin) || req.headers["sec-fetch-site"] === "cross-site") return res.status(403).json({ error: "Loopback same-origin verification only" });
    const cookie = (req.headers.cookie ?? "").split(";").map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    const selected = req.query.fixture;
    const parsed = scenarioSchema.safeParse(selected ?? "default");
    if (selected !== undefined && !parsed.success) return res.status(400).json({ error: "Invalid synthetic fixture scenario", scenarios: SCENARIOS });
    let state = selected === undefined ? sessions.get(cookie) : undefined;
    if (!state) {
      if (sessions.size >= 256) return res.status(503).json({ error: "Restart fixture server to clear synthetic sessions" });
      const id = String(++sequence);
      state = { scenario: parsed.data, listReads: 0, balance: 20, unlocked: new Set([REF_B]), intros: new Set(), pending: new Set(), calls: [], refused: [] };
      sessions.set(id, state);
      res.cookie(cookieName, id, { httpOnly: true, sameSite: "strict", path: "/" });
    }
    res.locals.fixture = state;
    next();
  });
  app.get("/__fixture/status", (_req, res) => {
    const state = res.locals.fixture;
    res.json({ synthetic: true, phase, scenario: state.scenario, balance: state.balance, listReads: state.listReads, pending: state.pending.size, calls: state.calls, refused: state.refused });
  });
  app.get("/__fixture/release", (_req, res) => {
    const state = res.locals.fixture;
    const count = state.pending.size;
    for (const release of [...state.pending]) release();
    res.json({ synthetic: true, released: count });
  });
  app.use("/api", (req, res) => {
    const state = res.locals.fixture;
    const { scenario } = state;
    const path = req.path;
    const call = `${req.method} ${req.originalUrl}`;
    state.calls.push(call);
    if (state.calls.length > 500) state.calls.shift();
    const json = (status, body) => res.status(status).json(body);
    const hold = complete => {
      const release = () => { state.pending.delete(release); if (!res.destroyed) complete(); };
      state.pending.add(release);
      res.on("close", () => state.pending.delete(release));
    };
    if (req.method === "GET") {
      if (path === "/trpc/auth.me") {
        const result = { result: { data: { json: person } } };
        return json(200, req.query.batch === undefined ? result : [result]);
      }
      if (path === "/dev-auth/session") return json(200, { signedIn: true, account: person });
      if (path === "/account/preferences") return json(200, { preferences: { timeZone: "UTC", dateFormat: "mdy", language: "en" } });
      if (path === "/notifications") return json(200, { notifications: [] });
      if (path === "/credits/summary") return json(200, { summary: { totalAvailable: 3 } });
      if (path === "/company-referrals/access") return json(200, { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null });
      if (path === "/employer/account") return json(200, { account: { credits: state.balance, budgetMonthlyUsdCents: 5000, approvalStatus: "approved" } });
      if (path === "/employer/spend-history") return json(200, { spend: [] });
      if (path === "/employer/talent") {
        state.listReads++;
        if (scenario === "loading") return hold(() => json(200, { talent: [] }));
        if (scenario === "denied") return json(403, { error: "Employer access is required" });
        if (scenario === "load-error" || (scenario === "retry" && state.listReads === 1)) return json(503, { error: "Synthetic talent service unavailable" });
        const query = req.query.query;
        const location = req.query.location;
        if ((query !== undefined && typeof query !== "string") || (location !== undefined && typeof location !== "string")) return json(400, { error: "Invalid synthetic search filters" });
        const talent = scenario === "empty" ? [] : rows.filter(row => (!query || [row.headline, ...row.skills].join(" ").toLowerCase().includes(query.slice(0, 120).toLowerCase())) && (!location || row.location.toLowerCase().includes(location.slice(0, 120).toLowerCase()))).map(row => ({ ...row, isUnlocked: state.unlocked.has(row.displayRef) }));
        return json(200, { talent });
      }
      const match = /^\/employer\/talent\/(tal_[A-Za-z0-9_-]{24})$/.exec(path);
      if (match && rows.some(row => row.displayRef === match[1])) {
        if (!state.unlocked.has(match[1])) return json(402, { error: "Unlock this profile with credits before viewing it" });
        if (scenario === "profile-error") return json(500, { error: "Synthetic profile unavailable" });
        return json(200, { profile }); // Deliberately no displayRef/name/contact/resume fields.
      }
    }
    if (req.method === "POST") {
      if (path === "/account/signup-language" || path === "/csp-report") return res.status(204).end();
      const match = /^\/employer\/talent\/(tal_[A-Za-z0-9_-]{24})\/(unlock|intro)$/.exec(path);
      if (match && rows.some(row => row.displayRef === match[1])) {
        const ref = match[1];
        if (match[2] === "intro") {
          if (!state.unlocked.has(ref) || scenario === "intro-refused") return json(409, { error: "Unlock this profile before requesting an intro" });
          const existing = state.intros.has(ref);
          state.intros.add(ref);
          return json(existing ? 200 : 201, { requested: true });
        }
        if (scenario === "unlock-error") return json(500, { error: "Synthetic unlock unavailable" });
        if (scenario === "unlock-402") return json(402, { error: "Top-up required", credits: 2 });
        const complete = () => {
          const existing = state.unlocked.has(ref);
          if (!existing && state.balance < 5) return json(402, { error: "Not enough unlock credits", credits: state.balance });
          if (!existing) { state.unlocked.add(ref); state.balance -= 5; }
          return json(existing ? 200 : 201, { unlocked: true, remaining: state.balance });
        };
        return scenario === "unlock-pending" ? hold(complete) : complete();
      }
    }
    state.refused.push(call);
    console.error(`[${phase}] refused synthetic route: ${call}`);
    return json(501, { error: "Unmatched synthetic request", method: req.method, path: req.originalUrl });
  });
  // Existing service workers can cache APIs without this boundary; use a clean browser.
  app.get("/sw.js", (_req, res) => res.status(404).end());
  app.use(express.static(root, { index: false, redirect: false, etag: false, dotfiles: "deny" }));
  app.get("*", (req, res) => req.path.startsWith("/assets/") || /\.[a-z0-9]+$/i.test(req.path) ? res.status(404).end() : res.sendFile(join(root, "index.html")));
  const server = await new Promise((done, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => done(listener));
    listener.on("error", reject);
  });
  return { phase, root, server, origin: `http://127.0.0.1:${server.address().port}` };
}

export async function startFixtures(baseline, candidate) {
  const targets = [];
  try {
    targets.push(await startTarget(baseline, "baseline"));
    targets.push(await startTarget(candidate, "candidate"));
    return targets;
  } catch (error) {
    for (const target of targets) { target.server.closeAllConnections(); target.server.close(); }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 4, "usage: node fixture-server.mjs /absolute/baseline/dist/public /absolute/candidate/dist/public");
  const targets = await startFixtures(process.argv[2], process.argv[3]);
  for (const { phase, root, origin } of targets) console.log(JSON.stringify({ synthetic: true, phase, root, origin, pid: process.pid, entry: `${origin}/employer/talent?fixture=default`, indexBytes: (await readFile(join(root, "index.html"))).length }));
  const stop = () => { for (const target of targets) { target.server.closeAllConnections(); target.server.close(); } };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
