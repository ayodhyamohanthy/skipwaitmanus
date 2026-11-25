// Local synthetic preview only. No backend, browser driver, provider or real account.
// Usage: node /absolute/path/fixture-server.mjs /absolute/source-worktree 16300
// Open /__fixtures for the allow-listed cases and manual action instructions.
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [source, portText] = process.argv.slice(2);
const port = Number(portText);
if (!source || !path.isAbsolute(source) || !/^\d+$/.test(portText || "") || !Number.isInteger(port) || port < 1024 || port > 65535 || process.argv.length !== 4) {
  throw new Error("Usage: node fixture-server.mjs /absolute/source-worktree <port:1024-65535>");
}
const root = path.resolve(source);
const origin = `http://127.0.0.1:${port}`;
const require = createRequire(path.join(root, "package.json"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const { z } = require("zod");
const routes = { payments: "/admin/payments", catalog: "/admin/catalog-sync", recovery: "/admin/token-recovery", "money-check": "/admin/money-check" };
const familyOf = name => name.startsWith("money-check-") ? "money-check" : name.split("-")[0];
const fixtureSchema = z.strictObject({
  signedIn: z.union([z.literal(false), z.object({ id: z.number().int(), role: z.string(), name: z.string().optional(), email: z.string().optional() })]).optional(),
  routes: z.array(z.strictObject({ method: z.enum(["GET", "POST"]).optional(), path: z.string().startsWith("/api/"), match: z.literal("prefix").optional(), status: z.number().int().min(100).max(599).optional(), body: z.json().optional(), maxCalls: z.number().int().positive().optional(), delayMs: z.number().int().nonnegative().optional(), abort: z.boolean().optional() })),
  actions: z.array(z.strictObject({ click: z.string().optional(), fill: z.tuple([z.string(), z.string()]).optional(), check: z.string().optional(), wait: z.number().optional(), waitFor: z.string().optional(), scroll: z.string().optional() })).optional(),
});
const fixtures = new Map();
const directory = path.join(root, "design/goal-ui/captures/admin-money/fixtures");
for (const file of (await readdir(directory)).sort()) {
  if (!/^admin-money__[a-z-]+\.json$/.test(file)) continue;
  const name = file.slice("admin-money__".length, -5);
  if (!routes[familyOf(name)]) throw new Error(`Unmapped fixture: ${file}`);
  fixtures.set(name, fixtureSchema.parse(JSON.parse(await readFile(path.join(directory, file), "utf8"))));
}
const apiRoute = (method, pathname, body, status = 200) => ({ method, path: pathname, status, body });
function extend(name, base, extraRoutes) {
  const fixture = fixtures.get(base);
  if (!fixture) throw new Error(`Missing historical fixture: ${base}`);
  fixtures.set(name, { ...structuredClone(fixture), actions: [], routes: [...extraRoutes, ...structuredClone(fixture.routes)] });
}
const catalogPath = "/api/admin/billing/catalog-sync";
const dryRun = fixtures.get("catalog-default").routes.find(item => item.path === catalogPath).body;
const catalogPlan = { ...dryRun, toCreate: [{ kind: "item_family", params: { id: "fixture-family", name: "Fixture family" } }], counts: { ...dryRun.counts, toCreate: 1 } };
const catalogResult = { outcome: "applied", site: dryRun.site, environment: "test", planHash: dryRun.planHash, created: [{ kind: "item_family", id: "fixture-family", diffs: [] }], failed: null, notAttempted: [], stoppedReason: null };
extend("catalog-apply-result", "catalog-default", [apiRoute("GET", catalogPath, catalogPlan), apiRoute("POST", `${catalogPath}/apply`, catalogResult)]);
extend("catalog-apply-error", "catalog-default", [apiRoute("GET", catalogPath, catalogPlan), apiRoute("POST", `${catalogPath}/apply`, { error: "Synthetic catalog apply failure. Nothing was changed." }, 503)]);
const fixtureUser = { id: 9, name: "Fixture Account", email: "fixture-account@example.com" };
extend("recovery-result", "recovery-default", [apiRoute("GET", "/api/admin/token-recovery/users", { users: [fixtureUser] }), apiRoute("POST", "/api/admin/token-recovery/grants", { grant: { tokenCount: 2, newBalance: 2 } })]);
extend("recovery-grant-error", "recovery-result", [apiRoute("POST", "/api/admin/token-recovery/grants", { error: "Synthetic recovery grant failure. Nothing was added." }, 503)]);
extend("payments-revoke-result", "payments-confirm", [apiRoute("POST", "/api/admin/payments/review/7", { payment: { paymentId: 7, tokenCount: 3, userId: 3, role: "job_seeker", decision: "revoke_unused", requested: 3, revoked: 3, unrecovered: 0, balanceBefore: 3, balanceAfter: 0 } }), apiRoute("POST", "/api/admin/payments/review/7/revoke-credits", { revoked: true })]);
extend("payments-mutation-error", "payments-result", [apiRoute("POST", "/api/admin/payments/review/7", { error: "Synthetic payment decision failure. Nothing was changed." }, 503)]);
extend("money-check-test-alert", "money-check-default", [apiRoute("POST", "/api/admin/alerts/test", { sentAt: "2026-11-20T08:05:00.000Z", sent: true })]);

const instructions = name => name.startsWith("catalog-apply-") ? ['Type "skipwait-test" in the site confirmation, then apply.']
  : name.startsWith("recovery-result") || name === "recovery-grant-error" ? ['Search "fixture", choose Fixture Account, enter 2 credits, case SUP-0001 and a synthetic reason, confirm and grant.']
  : name === "payments-revoke-result" ? ["Open Take back unused credits, then confirm."]
  : name === "payments-mutation-error" ? ["Click Add 3 credits."]
  : name === "money-check-test-alert" ? ["Click the test-alert button."] : fixtures.get(name).actions || [];
const calls = new Map();
const json = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
const identity = fixture => fixture.signedIn ? { openId: "fixture", loginMethod: "fixture", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", lastSignedIn: "2026-10-08T00:00:00.000Z", name: "Ops Admin", email: "ops-admin@example.com", ...fixture.signedIn } : null;
function selection(req, url) {
  const ref = req.headers.referer ? new URL(req.headers.referer) : null;
  if (ref && ref.origin !== origin) throw new Error("Use the loopback preview origin");
  const selected = url.searchParams.get("fixture") ?? ref?.searchParams.get("fixture");
  if (selected) {
    if (!fixtures.has(selected)) throw new Error("Unknown fixture; see /__fixtures");
    return selected;
  }
  const family = Object.keys(routes).find(key => routes[key] === (ref?.pathname || url.pathname));
  if (family) return `${family}-default`;
  throw new Error("Select a fixture using ?fixture=<case>; see /__fixtures");
}
const shell = new Map([
  ["/api/notifications", { notifications: [] }],
  ["/api/credits/summary", { summary: { totalAvailable: 0 } }],
  ["/api/account/preferences", { preferences: {} }],
  ["/api/company-referrals/access", { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null }],
]);
const plugin = {
  name: "local-admin-money-fixtures",
  enforce: "pre",
  configResolved(config) { config.server.proxy = {}; },
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      res.setHeader("Content-Security-Policy", `connect-src 'self' ws://127.0.0.1:${port}; form-action 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'`);
      res.setHeader("Referrer-Policy", "same-origin");
      res.setHeader("Cache-Control", "no-store");
      // Keep the worktree's debug plugin from writing browser logs into source.
      if (req.url?.startsWith("/__manus__/logs")) { res.writeHead(204); res.end(); return; }
      try {
        if (req.headers.host !== new URL(origin).host) return json(res, 403, { error: "Loopback fixture preview only" });
        const url = new URL(req.url || "/", origin);
        if (url.pathname === "/__fixtures") return json(res, 200, { synthetic: true, source: root, pid: process.pid, cases: [...fixtures.keys()].map(name => ({ name, url: `${origin}${routes[familyOf(name)]}?fixture=${name}`, actions: instructions(name), api: fixtures.get(name).routes.map(item => `${item.method || "GET"} ${item.path} -> ${item.status || 200}`) })) });
        const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
        if (!isApi) {
          if (Object.values(routes).includes(url.pathname) && req.method === "GET") calls.delete(selection(req, url));
          if (req.method !== "GET" && req.method !== "HEAD") return json(res, 403, { error: "Local fixture mutation denied" });
          return next();
        }
        const name = selection(req, url);
        const fixture = fixtures.get(name);
        const user = identity(fixture);
        if (req.method === "GET" && url.pathname === "/api/auth/me") return json(res, 200, user);
        if (req.method === "GET" && url.pathname === "/api/dev-auth/session") return json(res, 200, user ? { signedIn: true, account: user } : { signedIn: false });
        if (req.method === "GET" && url.pathname.startsWith("/api/trpc/")) {
          const procedures = url.pathname.slice("/api/trpc/".length).split(",");
          const answers = procedures.map(procedure => procedure === "auth.me" ? { result: { data: { json: user } } } : { error: { json: { message: "Local fixture API denied", code: -32004, data: { code: "NOT_FOUND", httpStatus: 404, path: procedure } } } });
          return json(res, 200, url.searchParams.has("batch") ? answers : answers[0]);
        }
        if (req.method === "POST" && ["/api/account/signup-language", "/api/csp-report"].includes(url.pathname)) { res.writeHead(204); res.end(); return; }
        const counts = calls.get(name) || new Map();
        calls.set(name, counts);
        const index = fixture.routes.findIndex((item, i) => (item.method || "GET") === req.method && (item.match === "prefix" ? url.pathname.startsWith(item.path) : url.pathname === item.path) && (item.maxCalls === undefined || (counts.get(i) || 0) < item.maxCalls));
        if (index >= 0) {
          const item = fixture.routes[index];
          counts.set(index, (counts.get(index) || 0) + 1);
          if (item.abort) { req.socket.destroy(); return; }
          if (item.delayMs) await new Promise(resolve => setTimeout(resolve, item.delayMs));
          return json(res, item.status || 200, item.body ?? {});
        }
        if (req.method === "GET" && shell.has(url.pathname)) return json(res, 200, shell.get(url.pathname));
        return json(res, user ? 404 : 401, { error: "Local fixture API denied" });
      } catch {
        return json(res, 400, { error: "Invalid local fixture selection; use /__fixtures" });
      }
    });
  },
};
process.env.VITE_GOAL_SURFACES = "admin-money";
const server = await createServer({ configFile: path.join(root, "vite.config.ts"), configLoader: "runner", root: path.join(root, "client"), mode: "development", cacheDir: await mkdtemp(path.join(tmpdir(), `admin-money-${port}-`)), plugins: [plugin], server: { host: "127.0.0.1", port, strictPort: true, open: false, proxy: {}, cors: false } });
await server.listen();
console.log(JSON.stringify({ pid: process.pid, source: root, origin, index: `${origin}/__fixtures`, cases: fixtures.size, goalSurfaces: "admin-money", synthetic: true }));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await server.close(); process.exit(0); });
