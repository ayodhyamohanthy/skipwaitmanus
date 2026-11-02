import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scrubTelemetryPath, scrubTelemetryUrl } from "./telemetryScrub";

const SECRET = "Zq9SECRETx7";

describe("scrubTelemetryPath (FND-4)", () => {
  it("replaces the token segment of every browser link route with :token", () => {
    expect(scrubTelemetryPath(`/email-review/${SECRET}`)).toBe("/email-review/:token");
    expect(scrubTelemetryPath(`/share-card/${SECRET}`)).toBe("/share-card/:token");
    expect(scrubTelemetryPath(`/fast/${SECRET}`)).toBe("/fast/:token");
    expect(scrubTelemetryPath(`/refer/acme/${SECRET}`)).toBe("/refer/:token/:token");
  });

  it("replaces the token segment of every token-bearing API route and keeps the rest of the path", () => {
    expect(scrubTelemetryPath(`/api/referrer-fast-track/${SECRET}`)).toBe("/api/referrer-fast-track/:token");
    expect(scrubTelemetryPath(`/api/referrer-fast-track/vanity/acme/${SECRET}`)).toBe("/api/referrer-fast-track/vanity/acme/:token");
    expect(scrubTelemetryPath(`/api/referral-share-cards/public/${SECRET}`)).toBe("/api/referral-share-cards/public/:token");
    expect(scrubTelemetryPath(`/api/referral-share-cards/public/${SECRET}/image.png`)).toBe("/api/referral-share-cards/public/:token/image.png");
    expect(scrubTelemetryPath(`/api/referrer-review-links/${SECRET}`)).toBe("/api/referrer-review-links/:token");
    expect(scrubTelemetryPath(`/api/referrer-review-links/${SECRET}/decision`)).toBe("/api/referrer-review-links/:token/decision");
    expect(scrubTelemetryPath(`/api/documents/by-key/${SECRET}`)).toBe("/api/documents/by-key/:token");
  });

  it("replaces a storage key in full, even one that carries slashes or a person's file name", () => {
    expect(scrubTelemetryPath("/api/documents/by-key/resumes/42/Jane%20Doe%20CV.pdf")).toBe("/api/documents/by-key/:token");
  });

  it("matches routes the way Express does: case-insensitive and with a trailing slash", () => {
    expect(scrubTelemetryPath(`/API/Referrer-Review-Links/${SECRET}/Decision`)).not.toContain(SECRET);
    expect(scrubTelemetryPath(`/fast/${SECRET}/`)).not.toContain(SECRET);
  });

  it("always drops the query and the hash", () => {
    expect(scrubTelemetryPath(`/share-card/${SECRET}?foo=1#bar`)).toBe("/share-card/:token");
    expect(scrubTelemetryPath("/api/company-referrals?resume=private.pdf&otp=123456")).toBe("/api/company-referrals");
    expect(scrubTelemetryPath("/premium#role=job_seeker")).toBe("/premium");
  });

  it("leaves paths without a token unchanged", () => {
    expect(scrubTelemetryPath("/api/company-referrals/mine")).toBe("/api/company-referrals/mine");
    expect(scrubTelemetryPath("/explore/acme")).toBe("/explore/acme");
    expect(scrubTelemetryPath("/api/referrer-fast-track")).toBe("/api/referrer-fast-track");
    expect(scrubTelemetryPath("")).toBe("/");
  });

  it("scrubs a full URL to its path only", () => {
    expect(scrubTelemetryUrl(`https://skipwait.me/api/referrer-review-links/${SECRET}?x=1#y`, "https://skipwait.me")).toBe("/api/referrer-review-links/:token");
    expect(scrubTelemetryUrl(`/email-review/${SECRET}`, "https://skipwait.me")).toBe("/email-review/:token");
    expect(scrubTelemetryUrl("https://skipwait.me/premium?role=job_seeker", "https://skipwait.me")).toBe("/premium");
  });
});

// Completeness: every route with a token-like parameter in these files must be scrubbed,
// so a token route added later without scrubbing fails here.
const TOKEN_PARAMS = new Set(["linkCode", "linkToken", "shareToken", "token", "vanityAlias", "key"]);
const SERVER_ROUTE = /\b(?:app|router)\.(?:get|post|put|patch|delete|all|use)\(\s*["'`]([^"'`]+)["'`]/g;
const CLIENT_ROUTE = /<Route\s+path=["']([^"']+)["']/g;

function routesWithTokenParams(file: string, pattern: RegExp): string[] {
  const source = readFileSync(join(__dirname, "..", file), "utf8");
  const routes: string[] = [];
  for (const match of source.matchAll(pattern)) {
    const route = match[1];
    const params = [...route.matchAll(/:([A-Za-z]+)/g)].map(m => m[1]);
    if (params.some(param => TOKEN_PARAMS.has(param))) routes.push(route);
  }
  return routes;
}

function sample(route: string): string {
  return route.replace(/:([A-Za-z]+)/g, (_whole, param: string) => (TOKEN_PARAMS.has(param) ? `${SECRET}${param}` : "acme"));
}

describe("telemetry scrub completeness (FND-4)", () => {
  const sources: Array<[string, RegExp, number]> = [
    ["server/privateReferralRoutes.ts", SERVER_ROUTE, 7],
    ["server/_core/storageProxy.ts", SERVER_ROUTE, 1],
    ["client/src/App.tsx", CLIENT_ROUTE, 4],
  ];

  for (const [file, pattern, atLeast] of sources) {
    it(`scrubs every token route in ${file}`, () => {
      const routes = routesWithTokenParams(file, pattern);
      expect(routes.length).toBeGreaterThanOrEqual(atLeast);
      for (const route of routes) {
        const scrubbed = scrubTelemetryPath(sample(route));
        expect(scrubbed, route).not.toContain(SECRET);
        expect(scrubbed, route).toContain(":token");
      }
    });
  }
});
