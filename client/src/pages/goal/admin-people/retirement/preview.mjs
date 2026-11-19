// Local-only production-bundle parity server. All API answers are synthetic;
// it has no production connection and sends no requests outside localhost.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [publicArg, portArg] = process.argv.slice(2);
if (!publicArg || !/^\d+$/.test(portArg ?? "")) throw new Error("Usage: preview.mjs <dist/public> <port>");
const publicRoot = resolve(publicArg);
const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../../design/goal-ui/captures/admin-people/fixtures");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const calls = [];
const states = new Map();

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}
async function fixtureFor(name) {
  if (!/^(users|privacy)-(default|signed-out|empty|error|loading|confirm|failure|refused)$/.test(name)) throw new Error("Invalid fixture");
  if (!states.has(name)) {
    const data = JSON.parse(await readFile(join(fixtureRoot, `admin-people__${name}.json`), "utf8"));
    states.set(name, data);
  }
  return states.get(name);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${portArg}`);
    const cookieName = /(?:^|; )adminPeopleFixture=([^;]+)/.exec(request.headers.cookie ?? "")?.[1];
    const name = url.searchParams.get("fixture") ?? cookieName ?? "users-default";
    const fixture = await fixtureFor(name);
    if (url.pathname === "/__qa/receipt") return json(response, 200, { publicRoot, fixture: name, calls });
    if (url.pathname.startsWith("/api/")) {
      calls.push({ fixture: name, method: request.method, path: url.pathname });
      const identity = fixture.signedIn ? { openId: "fixture", loginMethod: "fixture", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", lastSignedIn: "2026-10-08T00:00:00.000Z", ...fixture.signedIn } : null;
      if (url.pathname.startsWith("/api/trpc/")) {
        const names = url.pathname.slice("/api/trpc/".length).split(",");
        const results = names.map(procedure => ({ result: { data: { json: procedure === "auth.me" ? identity : fixture.trpc?.[procedure] ?? null } } }));
        return json(response, 200, url.searchParams.has("batch") ? results : results[0]);
      }
      if (url.pathname === "/api/dev-auth/session") return json(response, 200, { signedIn: Boolean(identity), account: identity });
      const hit = fixture.routes?.find(route => (route.method ?? "GET") === request.method && (route.match === "prefix" ? url.pathname.startsWith(route.path) : url.pathname === route.path));
      if (hit) {
        if (hit.abort) { response.destroy(); return; }
        if (hit.delayMs) await new Promise(done => setTimeout(done, hit.delayMs));
        return json(response, hit.status ?? 200, hit.body ?? {});
      }
      if (url.pathname === "/api/csp-report") return json(response, 204, null);
      return json(response, identity ? 404 : 401, { error: "Unmatched synthetic API request" });
    }
    let target = resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
    if (!target.startsWith(`${publicRoot}/`) && target !== publicRoot) return json(response, 403, { error: "Forbidden" });
    try { if (!(await stat(target)).isFile()) target = join(publicRoot, "index.html"); }
    catch { target = join(publicRoot, "index.html"); }
    const headers = { "Content-Type": types[extname(target)] ?? "application/octet-stream", "Cache-Control": "no-store" };
    if (url.searchParams.has("fixture")) headers["Set-Cookie"] = `adminPeopleFixture=${name}; Path=/; SameSite=Strict`;
    response.writeHead(200, headers);
    response.end(await readFile(target));
  } catch (error) {
    json(response, 500, { error: error instanceof Error ? error.message : "Preview failed" });
  }
});
server.listen(Number(portArg), "127.0.0.1", () => console.log(JSON.stringify({ localPreview: `http://127.0.0.1:${portArg}`, publicRoot })));
