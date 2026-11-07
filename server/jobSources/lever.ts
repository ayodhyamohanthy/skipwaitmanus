// Lever board adapter (D-174-job-sources-more, packet section 5.7).
// Reads the public postings API at api.lever.co and api.eu.lever.co with ?mode=json.
// Respects Lever's 1-second Crawl-delay.

import { z } from "zod";
import { fetchGuardedJson, type GuardedFetchFailure, ALLOWED_JOB_SOURCE_HOSTS } from "./fetch";
import { parseGreenhouseLocation, type NormalizedCatalogJob, type FetchJobBoardResult } from "./greenhouse";
import { stripHtml } from "./ashby";
import type { fetch as undiciFetch } from "undici";

export const LEVER_API_HOST = "api.lever.co";
export const LEVER_EU_API_HOST = "api.eu.lever.co";
export const LEVER_CRAWL_DELAY_MS = 1000;

let lastLeverRequestTime = 0;

export function resetLeverCrawlDelay(): void {
  lastLeverRequestTime = 0;
}

export async function waitLeverCrawlDelay(
  now = Date.now(),
  sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<void> {
  const elapsed = now - lastLeverRequestTime;
  if (lastLeverRequestTime > 0 && elapsed >= 0 && elapsed < LEVER_CRAWL_DELAY_MS) {
    await sleep(LEVER_CRAWL_DELAY_MS - elapsed);
  }
  lastLeverRequestTime = now;
}

const leverPostingSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  hostedUrl: z.string().url(),
  applyUrl: z.string().url().optional(),
  createdAt: z.number().optional(),
  categories: z
    .object({
      location: z.string().nullable().optional(),
      commitment: z.string().nullable().optional(),
      team: z.string().nullable().optional(),
      department: z.string().nullable().optional(),
      allLocations: z.array(z.string()).optional(),
    })
    .nullable()
    .optional(),
  workplaceType: z.string().nullable().optional(),
  description: z.string().optional(),
  descriptionPlain: z.string().optional(),
  additionalPlain: z.string().optional(),
});

const leverBoardResponseSchema = z.array(leverPostingSchema);

export function parseLeverJobs(payload: unknown): NormalizedCatalogJob[] {
  const parsed = leverBoardResponseSchema.parse(payload);
  return parsed.map((item) => {
    const rawLocation = item.categories?.location ?? null;
    const parsedPrimary = parseGreenhouseLocation(rawLocation);

    const wp = (item.workplaceType ?? "").toLowerCase();
    let workMode: "onsite" | "hybrid" | "remote" | "unknown" = parsedPrimary.workMode;
    if (wp.includes("hybrid")) {
      workMode = "hybrid";
    } else if (wp.includes("remote")) {
      workMode = "remote";
    } else if (wp.includes("onsite") || wp.includes("on-site")) {
      workMode = "onsite";
    } else if (rawLocation) {
      if (/\bhybrid\b/i.test(rawLocation)) workMode = "hybrid";
      else if (/\bremote\b/i.test(rawLocation)) workMode = "remote";
      else workMode = "onsite";
    }

    const locations = [...parsedPrimary.locations];
    if (item.categories?.allLocations?.length) {
      for (const loc of item.categories.allLocations) {
        if (!loc) continue;
        const parsedSec = parseGreenhouseLocation(loc);
        for (const l of parsedSec.locations) {
          if (!locations.includes(l)) {
            locations.push(l);
          }
        }
      }
    }
    if (locations.length === 0 && workMode === "remote") {
      locations.push("Remote");
    }

    const publishedDate = item.createdAt ? new Date(item.createdAt) : null;
    const publishedAt =
      publishedDate && !Number.isNaN(publishedDate.getTime())
        ? publishedDate.toISOString()
        : null;

    const snippetSource = item.descriptionPlain?.trim()
      ? item.descriptionPlain
      : stripHtml(item.description ?? "");

    return {
      externalId: item.id,
      title: item.text,
      rawLocation,
      locations,
      workMode,
      department: item.categories?.department || item.categories?.team || null,
      applyUrl: item.applyUrl || item.hostedUrl,
      snippet: snippetSource.slice(0, 400),
      publishedAt,
    };
  });
}

export async function fetchLeverJobBoard(
  source: { provider: string; boardToken: string; host?: string; evidenceUrl?: string },
  opts: { fetchImpl?: typeof undiciFetch; host?: string; skipCrawlDelay?: boolean } = {}
): Promise<FetchJobBoardResult> {
  if (source.provider !== "lever") return { ok: false, reason: "invalid_input" };

  let token = source.boardToken;
  let targetHost = LEVER_API_HOST;

  if (token.startsWith("eu:") || token.startsWith("eu/")) {
    targetHost = LEVER_EU_API_HOST;
    token = token.slice(3);
  } else if (source.evidenceUrl && /\.eu\.lever\.co/i.test(source.evidenceUrl)) {
    targetHost = LEVER_EU_API_HOST;
  }

  const host = opts.host ?? source.host ?? targetHost;
  if (
    host !== LEVER_API_HOST &&
    host !== LEVER_EU_API_HOST &&
    !ALLOWED_JOB_SOURCE_HOSTS.includes(host as (typeof ALLOWED_JOB_SOURCE_HOSTS)[number])
  ) {
    return { ok: false, reason: "refused_host" };
  }

  if (!/^[a-z0-9][a-z0-9.-]*$/i.test(token)) {
    return { ok: false, reason: "invalid_input" };
  }

  if (!opts.skipCrawlDelay) {
    await waitLeverCrawlDelay();
  }

  const url = `https://${host}/v0/postings/${encodeURIComponent(token)}?mode=json`;
  const res = await fetchGuardedJson(url, { allowedHost: host, fetchImpl: opts.fetchImpl });
  if (!res.ok) return res;

  const parsed = leverBoardResponseSchema.safeParse(res.payload);
  if (!parsed.success) return { ok: false, reason: "invalid_payload" };

  return { ok: true, jobs: parseLeverJobs(parsed.data), bytes: res.bytes };
}
