// SEARCH-universal (D-394): GET /api/search?q= answers one box that takes a
// job title, a job link, a company name or a company website. Public and
// signed-out like the directory reads; the query is Zod-validated with a
// length cap, one client is rate limited, and a degraded discovery portion is
// never publicly cached (so it can never masquerade as "no such company").
import type { Express } from "express";
import { SEARCH_RATE_LIMIT, searchQuerySchema, type SearchResponse } from "../shared/search";
import { CompanyDirectoryUnavailableError } from "./companyDirectorySource";
import { retryAfterSecondsUntil, setRetryAfter } from "./retryAfter";
import { captureServerError } from "./sentry";

export type SearchRouteDeps = {
  search: (query: string, clientKey?: string) => Promise<SearchResponse>;
  now?: () => number;
};

const WINDOW_MS = 60_000;
const MAX_CLIENTS = 5_000;

export function registerSearchRoutes(app: Express, deps: SearchRouteDeps) {
  const hits = new Map<string, { start: number; count: number }>();
  const now = deps.now ?? (() => Date.now());
  let calls = 0;

  app.get("/api/search", async (req, res) => {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).set("Cache-Control", "no-store").json({ error: "Invalid search" });

    const at = now();
    if (++calls % 100 === 0 || hits.size > MAX_CLIENTS) {
      hits.forEach((value, key) => { if (at - value.start >= WINDOW_MS) hits.delete(key); });
      while (hits.size > MAX_CLIENTS) {
        const oldest = hits.keys().next().value;
        if (oldest === undefined) break;
        hits.delete(oldest);
      }
    }
    const key = req.ip || "unknown";
    const hit = hits.get(key);
    if (hit && at - hit.start < WINDOW_MS && hit.count >= SEARCH_RATE_LIMIT) {
      setRetryAfter(res, retryAfterSecondsUntil(hit.start + WINDOW_MS, at));
      return res.status(429).set("Cache-Control", "no-store").json({ error: "Too many searches. Wait a minute and try again." });
    }
    hits.set(key, !hit || at - hit.start >= WINDOW_MS ? { start: at, count: 1 } : { ...hit, count: hit.count + 1 });

    try {
      const result = await deps.search(parsed.data.q, req.ip);
      res.set("Cache-Control", result.discoveryState === "degraded" ? "private, no-store" : "public, max-age=30").json(result);
    } catch (error) {
      if (error instanceof CompanyDirectoryUnavailableError) {
        return res.status(503).set("Cache-Control", "no-store").json({ error: error.message });
      }
      captureServerError(error, { route: "/api/search" });
      res.status(500).set("Cache-Control", "no-store").json({ error: "We could not search right now" });
    }
  });
}
