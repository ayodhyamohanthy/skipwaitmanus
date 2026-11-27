// Loopback-only synthetic proof host. No outbound requests, real sessions or providers.
import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";

const [buildDir, portArg, sourceSHA, ...extra] = process.argv.slice(2);
if (!buildDir || !/^\d+$/.test(portArg ?? "") || Number(portArg) < 1 || Number(portArg) > 65535 || !/^[a-f\d]{40}$/i.test(sourceSHA ?? "") || extra.length) {
  throw new Error("Usage: node preview.mjs <build-dir> <port:1-65535> <sourceSHA:40-hex>");
}
const root = await realpath(resolve(buildDir));
if (!(await stat(resolve(root, "index.html"))).isFile()) throw new Error("Build directory needs index.html");
const origin = `http://127.0.0.1:${Number(portArg)}`;
const summary = { totalAvailable: 8, monthlyAllowance: 3, monthlyCreditsRemaining: 3, plan: "free", purchasedCreditsRemaining: 5, ledger: { buckets: { purchased: 5 } }, promoCreditsRemaining: 0, promoExpiresAt: null, promoStatus: null, promoOfferActive: false };
const account = { id: 21, openId: "synthetic-premium", name: "Test Seeker", email: "seeker@example.test", role: "user", loginMethod: "fixture", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", lastSignedIn: "2026-10-01T00:00:00Z" };
const scenarios = new Map([
  ["paused", { signedIn: true }],
  ["signed-out", { signedIn: false }],
  ["balance-error", { signedIn: true, balanceError: true }],
  ["referrer", { signedIn: true, role: "referrer" }],
  ["pending", { signedIn: true, recovery: "pending" }],
  ["credited", { signedIn: true, recovery: "credited" }],
  ["review", { signedIn: true, recovery: "requires_review" }],
  ["recovery-error", { signedIn: true, recovery: "error" }],
  ["recovery-timeout", { signedIn: true, recovery: "timeout" }],
  ["referrer-pending", { signedIn: true, role: "referrer", recovery: "pending" }],
  ["signed-out-pending", { signedIn: false, recovery: "pending" }],
  ["signed-out-referrer-pending", { signedIn: false, role: "referrer", recovery: "pending" }],
]);
const navigationUrls = Object.fromEntries([...scenarios].map(([name, scenario]) => {
  const url = new URL("/premium", origin);
  url.searchParams.set("proof", name);
  if (scenario.recovery) url.searchParams.set("payment", "pending");
  if (scenario.role === "referrer") url.searchParams.set("role", "referrer");
  return [name, url.href];
}));
const receipts = new Map([...scenarios.keys()].map(name => [name, { total: 0, capped: false, requests: {}, recent: [], timeoutOpen: 0 }]));
const apiPaths = new Set(["/api/dev-auth/session", "/api/credits/summary", "/api/chargebee/credit-recovery", "/api/company-referrals/access", "/api/notifications", "/api/account/preferences"]);
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".webp": "image/webp", ".avif": "image/avif", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".wasm": "application/wasm" };
const failure = (status, message) => Object.assign(new Error(message), { status });
const contained = file => { const part = relative(root, file); return part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part); };

function requestUrl(request) {
  if (request.headers.host !== new URL(origin).host || (request.headers.origin && request.headers.origin !== origin)) throw failure(403, "Loopback origin required");
  const target = request.url ?? "";
  if (!target.startsWith("/") || target.startsWith("//") || target.length > 4096) throw failure(400, "Invalid request target");
  let pathname;
  try { pathname = decodeURIComponent(target.split("?")[0]); } catch { throw failure(400, "Invalid path encoding"); }
  if (/[\\\u0000-\u001f\u007f]/.test(pathname) || pathname.split("/").some(part => part.startsWith("."))) throw failure(400, "Unsafe path");
  const url = new URL(target, origin);
  if (url.origin !== origin || url.pathname.startsWith("//")) throw failure(400, "Invalid request origin");
  return { url, pathname };
}

function scenarioName(url) {
  const names = url.searchParams.getAll("proof");
  if (names.length > 1 || (names.length && !scenarios.has(names[0]))) throw failure(400, "Unknown proof scenario");
  return names[0] ?? "paused";
}

function apiScenario(request) {
  if (!request.headers.referer) return "paused";
  let referrer;
  try { referrer = new URL(request.headers.referer); } catch { throw failure(400, "Invalid Referer"); }
  if (referrer.origin !== origin || !["/premium", "/premium/"].includes(referrer.pathname)) throw failure(403, "Same-origin premium Referer required");
  return scenarioName(referrer);
}

function record(name, method, pathname) {
  const receipt = receipts.get(name);
  if (receipt.total >= 10000) { receipt.capped = true; return; }
  const route = apiPaths.has(pathname) || pathname === "/api/trpc/auth.me" ? pathname : "(unknown-api)";
  const verb = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(method) ? method : "OTHER";
  const key = `${verb} ${route}`;
  receipt.total += 1;
  receipt.requests[key] = (receipt.requests[key] ?? 0) + 1;
  receipt.recent.push(key);
  if (receipt.recent.length > 32) receipt.recent.shift();
}

function json(response, status, body, head = false) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(head ? undefined : JSON.stringify(body));
}

async function recoveryBody(request, role) {
  let text = "";
  for await (const chunk of request) {
    text += chunk.toString("utf8");
    if (Buffer.byteLength(text) > 2048) throw failure(413, "Fixture body too large");
  }
  let body;
  try { body = JSON.parse(text); } catch { throw failure(400, "Synthetic checkout body required"); }
  if (!body || body.hostedPageId !== "hp-synthetic" || body.role !== role || Object.keys(body).some(key => !["hostedPageId", "role"].includes(key))) throw failure(400, "Synthetic checkout and scenario role required");
}

async function api(request, response, pathname, url) {
  const name = apiScenario(request);
  const scenario = scenarios.get(name);
  const method = request.method ?? "GET";
  record(name, method, pathname);
  const recovery = pathname === "/api/chargebee/credit-recovery";
  const procedures = pathname.startsWith("/api/trpc/") ? pathname.slice(10).split(",") : [];
  const trpc = procedures.length > 0 && procedures.length <= 8 && procedures.every(value => value === "auth.me");
  if ((!apiPaths.has(pathname) && !trpc) || (recovery && !scenario.recovery)) return json(response, 404, { error: "Not in capture fixture" });
  if (method !== (recovery ? "POST" : "GET") && !(method === "HEAD" && !recovery)) {
    response.setHeader("Allow", recovery ? "POST" : "GET, HEAD");
    return json(response, 405, { error: "Fixture method unavailable" });
  }
  const head = method === "HEAD";
  const fixtureAccount = scenario.signedIn ? account : null;
  if (trpc) {
    const values = procedures.map(() => ({ result: { data: { json: fixtureAccount } } }));
    return json(response, 200, url.searchParams.has("batch") ? values : values[0], head);
  }
  if (pathname === "/api/dev-auth/session") return json(response, 200, { signedIn: Boolean(fixtureAccount), account: fixtureAccount }, head);
  if (pathname === "/api/credits/summary") return json(response, scenario.balanceError ? 503 : 200, scenario.balanceError ? { error: "Synthetic unavailable" } : { summary }, head);
  if (pathname === "/api/company-referrals/access") return json(response, 200, { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null }, head);
  if (pathname === "/api/notifications") return json(response, 200, { notifications: [] }, head);
  if (pathname === "/api/account/preferences") return json(response, 200, { preferences: { timeZone: "UTC", dateFormat: "dmy" } }, head);
  if (!scenario.signedIn) return json(response, 401, { error: "Synthetic sign-in required" });
  await recoveryBody(request, scenario.role ?? "job_seeker");
  if (scenario.recovery === "timeout") {
    const receipt = receipts.get(name);
    if (receipt.timeoutOpen >= 8) return json(response, 429, { error: "Synthetic stall limit reached" });
    receipt.timeoutOpen += 1;
    response.once("close", () => { receipt.timeoutOpen -= 1; });
    // Do not send headers/body: the application's own 15-second deadline aborts this one fixture.
    request.socket.setTimeout(0);
    return;
  }
  return json(response, scenario.recovery === "error" ? 503 : 200, scenario.recovery === "credited" ? { status: "credited", tokenCount: 5, summary } : { status: scenario.recovery });
}

function inject(html, name) {
  const nonce = randomBytes(18).toString("base64");
  const scenario = scenarios.get(name);
  const seed = scenario.recovery ? `sessionStorage.setItem("skipwait.pending-chargebee-checkout", ${JSON.stringify(JSON.stringify({ hostedPageId: "hp-synthetic", role: scenario.role ?? "job_seeker" }))});` : "";
  const bootstrap = `<script nonce="${nonce}">(() => { sessionStorage.clear(); localStorage.clear(); ${seed} })();</script>`;
  if (!/<head(?:\s[^>]*)?>/i.test(html)) throw failure(500, "Build HTML needs a head element");
  return { html: html.replace(/<head(?:\s[^>]*)?>/i, match => `${match}${bootstrap}`), nonce };
}

async function serve(request, response) {
  const { url, pathname } = requestUrl(request);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  const csp = nonce => `default-src 'self'; connect-src 'self'; script-src 'self'${nonce ? ` 'nonce-${nonce}'` : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; worker-src 'none'`;
  response.setHeader("Content-Security-Policy", csp());
  if (pathname === "/api" || pathname.startsWith("/api/")) return api(request, response, pathname, url);
  if (!["GET", "HEAD"].includes(request.method)) {
    response.setHeader("Allow", "GET, HEAD");
    return json(response, 405, { error: "Read-only preview" });
  }
  const head = request.method === "HEAD";
  if (pathname === "/__proof/receipt") {
    const name = scenarioName(url);
    return json(response, 200, { synthetic: true, sourceSHA, scenario: name, navigationUrl: navigationUrls[name], ...receipts.get(name) }, head);
  }
  const spa = ["/", "/premium", "/premium/", "/index.html"].includes(pathname);
  const candidate = resolve(root, spa ? "index.html" : `.${pathname}`);
  if (!contained(candidate)) throw failure(403, "Path outside build directory");
  let file;
  try { file = await realpath(candidate); } catch (error) { if (["ENOENT", "ENOTDIR"].includes(error.code)) throw failure(404, "Static file not found"); throw error; }
  if (!contained(file)) throw failure(403, "Symlink outside build directory");
  if (!(await stat(file)).isFile()) throw failure(404, "Static file not found");
  let content = await readFile(file);
  const extension = extname(file).toLowerCase();
  if (extension === ".html") {
    const injected = inject(content.toString("utf8"), scenarioName(url));
    content = Buffer.from(injected.html);
    response.setHeader("Content-Security-Policy", csp(injected.nonce));
  }
  response.writeHead(200, { "Content-Type": mime[extension] ?? "application/octet-stream", "Content-Length": content.length });
  response.end(head ? undefined : content);
}

const server = createServer((request, response) => {
  void serve(request, response).catch(error => {
    if (response.destroyed || response.writableEnded) return;
    if (response.headersSent) return response.destroy();
    json(response, Number.isInteger(error.status) ? error.status : 500, { error: Number.isInteger(error.status) ? error.message : "Preview request failed" });
  });
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.maxHeadersCount = 64;
server.maxConnections = 128;
server.on("upgrade", (request, socket) => socket.destroy());
server.on("error", error => { console.error(`Preview host failed: ${error.code ?? "server_error"}`); process.exitCode = 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { server.close(); server.closeAllConnections(); });
server.listen(Number(portArg), "127.0.0.1", () => {
  console.log(JSON.stringify({ synthetic: true, sourceSHA, origin, navigationUrls, receiptUrl: `${origin}/__proof/receipt?proof=paused`, note: "Fixture endpoints only. No real sessions, API/provider access, browser launch or build. Recovery timeout uses the app's own 15-second deadline." }, null, 2));
});
