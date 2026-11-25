// Ashby board adapter (D-174-job-sources-more, packet section 5.7). Reads the
// public board API at api.ashbyhq.com/posting-api/job-board/{name}.
// Location parsing and HTML stripping are aligned with the catalog contracts.

import { z } from "zod";
import { plainTextSnippet } from "./plainText";
import { fetchGuardedJson, type GuardedFetchFailure, ALLOWED_JOB_SOURCE_HOSTS } from "./fetch";
import { parseGreenhouseLocation, type NormalizedCatalogJob, type FetchJobBoardResult } from "./greenhouse";
import type { fetch as undiciFetch } from "undici";

export const ASHBY_API_HOST = "api.ashbyhq.com";

const ashbyBoardResponseSchema = z.object({
  success: z.boolean().optional(),
  jobs: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      department: z.string().nullable().optional(),
      team: z.string().nullable().optional(),
      location: z.string().nullable().optional(),
      secondaryLocations: z
        .array(
          z.object({
            location: z.string().nullable().optional(),
          })
        )
        .nullable()
        .optional(),
      isRemote: z.boolean().nullable().optional(),
      workplaceType: z.string().nullable().optional(),
      isListed: z.boolean().nullable().optional(),
      jobUrl: z.string().url().nullable().optional(),
      applyUrl: z.string().url().nullable().optional(),
      publishedAt: z.string().nullable().optional(),
      descriptionPlain: z.string().nullable().optional(),
      descriptionHtml: z.string().nullable().optional(),
    })
  ),
});

/** Plain text from provider HTML (kept for callers; see plainText.ts for why decoding comes first). */
export function stripHtml(html: string): string {
  return plainTextSnippet(html, Number.MAX_SAFE_INTEGER);
}

export function parseAshbyJobs(payload: unknown): NormalizedCatalogJob[] {
  const parsed = ashbyBoardResponseSchema.parse(payload);
  return parsed.jobs.map((job) => {
    const rawLocation = job.location ?? null;
    const parsedPrimary = parseGreenhouseLocation(rawLocation);

    const wp = (job.workplaceType ?? "").toLowerCase();
    let workMode: "onsite" | "hybrid" | "remote" | "unknown" = "unknown";
    if (wp.includes("hybrid")) {
      workMode = "hybrid";
    } else if (wp.includes("remote") || job.isRemote) {
      workMode = "remote";
    } else if (wp.includes("onsite") || wp.includes("on-site")) {
      workMode = "onsite";
    } else if (parsedPrimary.workMode !== "unknown") {
      workMode = parsedPrimary.workMode;
    } else if (rawLocation) {
      workMode = "onsite";
    }

    const locations = [...parsedPrimary.locations];
    if (job.secondaryLocations?.length) {
      for (const sec of job.secondaryLocations) {
        if (!sec.location) continue;
        const parsedSec = parseGreenhouseLocation(sec.location);
        for (const loc of parsedSec.locations) {
          if (!locations.includes(loc)) {
            locations.push(loc);
          }
        }
      }
    }
    if (locations.length === 0 && workMode === "remote") {
      locations.push("Remote");
    }

    const publishedDate = job.publishedAt ? new Date(job.publishedAt) : null;
    const publishedAt =
      publishedDate && !Number.isNaN(publishedDate.getTime())
        ? publishedDate.toISOString()
        : null;

    const snippetSource = job.descriptionPlain?.trim()
      ? job.descriptionPlain
      : stripHtml(job.descriptionHtml ?? "");

    return {
      externalId: job.id,
      title: job.title,
      rawLocation,
      locations,
      workMode,
      department: job.department ?? job.team ?? null,
      applyUrl: job.applyUrl ?? job.jobUrl ?? "",
      snippet: snippetSource.slice(0, 400),
      publishedAt,
    };
  });
}

export async function fetchAshbyJobBoard(
  source: { provider: string; boardToken: string },
  opts: { fetchImpl?: typeof undiciFetch; host?: string } = {}
): Promise<FetchJobBoardResult> {
  if (source.provider !== "ashby") return { ok: false, reason: "invalid_input" };
  // Board token: e.g. openai, 1password, snowflake, kraken.com
  if (!/^[a-z0-9][a-z0-9.-]*$/i.test(source.boardToken)) {
    return { ok: false, reason: "invalid_input" };
  }

  const host = opts.host ?? ASHBY_API_HOST;
  if (host !== ASHBY_API_HOST && !ALLOWED_JOB_SOURCE_HOSTS.includes(host as (typeof ALLOWED_JOB_SOURCE_HOSTS)[number])) {
    return { ok: false, reason: "refused_host" };
  }

  const url = `https://${host}/posting-api/job-board/${encodeURIComponent(source.boardToken)}`;
  const res = await fetchGuardedJson(url, { allowedHost: host, fetchImpl: opts.fetchImpl });
  if (!res.ok) return res;

  const parsed = ashbyBoardResponseSchema.safeParse(res.payload);
  if (!parsed.success) return { ok: false, reason: "invalid_payload" };

  return { ok: true, jobs: parseAshbyJobs(parsed.data), bytes: res.bytes };
}
