import * as Sentry from "@sentry/node";
import type { Request, Response } from "express";
import { z } from "zod";
import { scrubTelemetryUrl } from "../shared/telemetryScrub";
import { isServerSentryActive } from "./sentry";

// D-100.csp-report: the report-only CSP (server/securityHeaders.ts) posts its
// violations here. globalSecurityHeaders answers this route before any body
// parser, so the handler reads its own raw body, capped at 8 KB. It keeps only
// the effective directive, the blocked host and a scrubbed page path (FND-4's
// shared scrubber drops query, fragment and token segments), counts each
// (directive, blocked host) pair, and sends one scrubbed message per pair per
// UTC day. Nothing else is stored, no cookie is set and no session is needed.

export const CSP_REPORT_PATH = "/api/csp-report";
export const CSP_REPORT_MAX_BYTES = 8 * 1024;
const DEFAULT_MAX_PAIRS_PER_DAY = 200;
const SCRUB_ORIGIN = "https://skipwait.me";
const CONTENT_TYPES = new Set(["application/csp-report", "application/reports+json"]);

export type CspViolation = { directive: string; blockedHost: string; documentPath: string };
export type CspReportEvent = CspViolation & { day: string; message: string };
export type CspReportEmit = (event: CspReportEvent) => void;

const legacyReportSchema = z.object({
  "csp-report": z.object({
    "document-uri": z.string().optional(),
    "blocked-uri": z.string().optional(),
    "effective-directive": z.string().optional(),
    "violated-directive": z.string().optional(),
  }),
});

const reportingApiSchema = z.array(z.object({
  type: z.string(),
  body: z.object({
    documentURL: z.string().optional(),
    blockedURL: z.string().optional(),
    effectiveDirective: z.string().optional(),
  }).optional(),
}));

function directiveLabel(value: string | undefined): string {
  const first = (value ?? "").trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
  return /^[a-z-]{1,64}$/.test(first) ? first : "unknown";
}

// The blocked resource is reduced to its host (or scheme / keyword such as
// `inline`, `eval`, `data`), never its path or query.
function blockedLabel(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (raw === "") return "none";
  try {
    const url = new URL(raw);
    const host = url.host.toLowerCase();
    if (host !== "") return /^[a-z0-9.\-:[\]]{1,253}$/.test(host) ? host : "other";
    const scheme = url.protocol.replace(/:$/, "").toLowerCase();
    return /^[a-z][a-z0-9+.-]{0,31}$/.test(scheme) ? scheme : "other";
  } catch {
    const keyword = raw.toLowerCase();
    return /^[a-z][a-z-]{0,31}$/.test(keyword) ? keyword : "other";
  }
}

function violation(document: string | undefined, blocked: string | undefined, directive: string | undefined): CspViolation {
  return {
    directive: directiveLabel(directive),
    blockedHost: blockedLabel(blocked),
    documentPath: document ? scrubTelemetryUrl(document, SCRUB_ORIGIN) : "/",
  };
}

/** The violations in a report body, or null when the body is malformed or its type unsupported. */
export function parseCspReportBody(contentType: string, raw: string): CspViolation[] | null {
  if (!CONTENT_TYPES.has(contentType)) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (contentType === "application/csp-report") {
    const parsed = legacyReportSchema.safeParse(json);
    if (!parsed.success) return null;
    const report = parsed.data["csp-report"];
    return [violation(report["document-uri"], report["blocked-uri"], report["effective-directive"] ?? report["violated-directive"])];
  }
  const parsed = reportingApiSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data
    .filter(entry => entry.type === "csp-violation" && entry.body !== undefined)
    .map(entry => violation(entry.body?.documentURL, entry.body?.blockedURL, entry.body?.effectiveDirective));
}

export type CspReportCounter = {
  record: (violation: CspViolation) => void;
  count: (directive: string, blockedHost: string) => number;
};

export function createCspReportCounter(options: { emit: CspReportEmit; now?: () => number; maxPairsPerDay?: number }): CspReportCounter {
  const now = options.now ?? Date.now;
  const maxPairs = options.maxPairsPerDay ?? DEFAULT_MAX_PAIRS_PER_DAY;
  let day = "";
  let counts = new Map<string, number>();
  let capReported = false;
  const keyOf = (directive: string, host: string) => `${directive} ${host}`;
  const roll = () => {
    const today = new Date(now()).toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      counts = new Map();
      capReported = false;
    }
  };
  return {
    record(entry) {
      roll();
      const key = keyOf(entry.directive, entry.blockedHost);
      const seen = counts.get(key);
      if (seen !== undefined) {
        counts.set(key, seen + 1);
        return;
      }
      if (counts.size >= maxPairs) {
        if (!capReported) {
          capReported = true;
          options.emit({ day, directive: "*", blockedHost: "*", documentPath: "*", message: `CSP report-only: daily limit of ${maxPairs} distinct violations reached; further new pairs are not reported today` });
        }
        return;
      }
      counts.set(key, 1);
      options.emit({ ...entry, day, message: `CSP report-only violation: ${entry.directive} blocked ${entry.blockedHost} on ${entry.documentPath}` });
    },
    count(directive, blockedHost) {
      roll();
      return counts.get(keyOf(directive, blockedHost)) ?? 0;
    },
  };
}

function emitToLogAndSentry(event: CspReportEvent): void {
  console.warn(`[csp-report] ${event.message}`);
  if (!isServerSentryActive()) return;
  Sentry.captureMessage(event.message, {
    level: "warning",
    tags: { csp_directive: event.directive, csp_blocked_host: event.blockedHost, csp_day: event.day },
  });
}

function finish(res: Response, status: number): void {
  res.setHeader("Cache-Control", "no-store");
  if (status !== 204) res.setHeader("Connection", "close");
  res.status(status).end();
}

export function createCspReportHandler(counter: CspReportCounter): (req: Request, res: Response) => void {
  return (req, res) => {
    const contentType = (req.headers["content-type"] ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > CSP_REPORT_MAX_BYTES) {
      req.resume();
      finish(res, 413);
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on("data", (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > CSP_REPORT_MAX_BYTES) {
        done = true;
        finish(res, 413);
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", () => {
      if (done) return;
      done = true;
      finish(res, 400);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      const violations = parseCspReportBody(contentType, Buffer.concat(chunks).toString("utf8"));
      if (violations === null) {
        finish(res, 400);
        return;
      }
      for (const entry of violations) counter.record(entry);
      finish(res, 204);
    });
  };
}

/** The live handler: one process-wide counter, scrubbed log line plus Sentry message. */
export const handleCspReport = createCspReportHandler(createCspReportCounter({ emit: emitToLogAndSentry }));
