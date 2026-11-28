import { mkdir } from "node:fs/promises";
import path from "node:path";

import { ORIGIN } from "./live-qa-signed-in.mjs";
const NAV_TIMEOUT_MS = 30_000;
const QUIET_TIMEOUT_MS = 10_000;
const MAX_LINE = 300;
import { DEMO } from "./liveQaJourneyContracts.mjs";

const safeRoute = input => {
  if (typeof input !== "string" || !input.startsWith("/") || input.startsWith("//") || input.includes("\\") || /[\u0000-\u001f\u007f]/.test(input)) {
    throw new Error("journey browser: route must be origin-relative");
  }
  let parsed;
  try { parsed = new URL(input, ORIGIN); } catch { throw new Error("journey browser: invalid route"); }
  if (parsed.origin !== ORIGIN || parsed.username || parsed.password) throw new Error("journey browser: route must stay on the canonical origin");
  const pathname = parsed.pathname;
  return { pathname, search: parsed.search };
};

const allowedApi = (method, pathname) => {
  if (method === "GET" && pathname === "/api/trpc/auth.me") return true;
  if (method === "POST" && pathname === "/api/auth/reviewer/sign-in") return true;
  if (method === "GET" && /^\/api\/credits\/(?:summary|ledger)$/.test(pathname)) return true;
  if (method === "GET" && /^\/api\/companies(?:\/[-a-z0-9]+)?$/.test(pathname)) return true;
  if (method === "POST" && pathname === "/api/documents") return true;
  if (method === "GET" && /^\/api\/documents\/\d+$/.test(pathname)) return true;
  if (method === "POST" && /^\/api\/company-referrals(?:\/\d+\/(?:claim|one-click-review|step-back|withdraw))?$/.test(pathname)) return true;
  if (method === "GET" && /^\/api\/company-referrals(?:\/(?:inbox|\d+(?:\/preview)?))?$/.test(pathname)) return true;
  if (method === "POST" && pathname === "/api/job-link/preview") return true;
  return false;
};

const errorText = (error, redact) => {
  const text = redact(error instanceof Error ? error.message : String(error));
  return text.split("\n")[0].replace(/https?:\/\/[^\s"'<>]+/gi, url => {
    try {
      const parsed = new URL(url);
      return parsed.origin === ORIGIN ? parsed.pathname : "[external URL]";
    } catch { return "[URL]"; }
  }).replace(/\?.*$/, "").slice(0, MAX_LINE);
};

async function jsonOf(response) {
  try { return await response.json(); } catch { return null; }
}

/** Build per-role, isolated signed-in clients for the live journeys packet. */
export function createJourneyClientFactory({ browser, redact, outDir = "live-qa" }) {
  if (!browser || typeof browser.newContext !== "function") throw new TypeError("journey browser requires a Playwright browser");
  if (typeof redact !== "function") throw new TypeError("journey browser requires a redactor");
  const contexts = new Map();
  const contextFor = role => {
    if (!Object.hasOwn(DEMO, role)) throw new Error("journey browser: unknown demo role");
    if (!contexts.has(role)) contexts.set(role, browser.newContext());
    return contexts.get(role);
  };

  const request = async (role, method, input, data, headers) => {
    const route = safeRoute(input);
    if (!allowedApi(method, route.pathname)) throw new Error(`journey browser: ${method} ${route.pathname} is outside the allowed QA API`);
    let response;
    try {
      const context = await contextFor(role);
      const options = { failOnStatusCode: false, maxRedirects: 0, timeout: NAV_TIMEOUT_MS };
      if (data !== undefined) options.data = data;
      if (headers !== undefined) options.headers = headers;
      response = await context.request[method.toLowerCase()](`${ORIGIN}${route.pathname}${route.search}`, options);
    } catch {
      throw new Error(`journey browser: ${method} ${route.pathname} request failed`);
    }
    return { status: response.status(), body: await jsonOf(response) };
  };

  return role => {
    if (!Object.hasOwn(DEMO, role)) throw new Error("journey browser: unknown demo role");
    return {
      signIn: password => request(role, "POST", "/api/auth/reviewer/sign-in", { email: DEMO[role], password }),
      me: () => request(role, "GET", "/api/trpc/auth.me"),
      get: target => request(role, "GET", target),
      post: (target, body, headers) => request(role, "POST", target, body, headers),
      capture: async (target, width) => {
        const route = safeRoute(target);
        if (!((route.pathname === "/queue") || /^\/conversation\/\d+$/.test(route.pathname)) || route.search) {
          throw new Error("journey browser: capture target is outside the allowed QA pages");
        }
        const fileName = `${route.pathname.slice(1).replaceAll("/", "-")}-${width}.png`;
        const directory = path.join(outDir, role);
        const file = path.join(directory, fileName);
        const current = { status: null, title: null, pageErrors: [], consoleErrors: [], clientErrors: [], capture: null, navigationError: null };
        const context = await contextFor(role);
        const page = await context.newPage();
        page.on("pageerror", error => current.pageErrors.push(errorText(error, redact)));
        page.on("console", message => {
          if (message.type() === "error") current.consoleErrors.push(errorText(message.text(), redact));
        });
        page.on("response", response => {
          if (response.status() >= 400) {
            const routePath = safeResponsePath(response.url());
            current.clientErrors.push(`${response.status()} ${response.request().method()} ${routePath}`.slice(0, MAX_LINE));
          }
        });
        try {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
          const response = await page.goto(`${ORIGIN}${route.pathname}`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
          const actual = new URL(page.url());
          if (actual.origin !== ORIGIN || actual.pathname !== route.pathname) throw new Error("capture left the requested page");
          current.status = response?.status() ?? null;
          await page.waitForLoadState("networkidle", { timeout: QUIET_TIMEOUT_MS }).catch(() => {});
          current.title = redact(await page.title());
          await mkdir(directory, { recursive: true });
          await page.screenshot({ path: file, fullPage: true });
          current.capture = file;
        } catch {
          current.navigationError = `navigation or capture failed for ${route.pathname}`;
        } finally {
          await page.close().catch(() => {});
        }
        return current;
      },
    };
  };
}

function safeResponsePath(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === ORIGIN ? parsed.pathname : "[external response]";
  } catch { return "[invalid response]"; }
}
