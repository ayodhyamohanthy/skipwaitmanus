import { readFileSync } from "node:fs";
import * as Sentry from "@sentry/node";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as cspReport from "./cspReport";
import {
  CSP_REPORT_MAX_BYTES,
  createCspReportCounter,
  createCspReportHandler,
  handleCspReport,
  parseCspReportBody,
  type CspReportEmit,
} from "./cspReport";

// The live handler's emitter is exercised with Sentry mocked, so the message
// and tags it would send can be read without a DSN or any network.
vi.mock("@sentry/node", () => ({ captureMessage: vi.fn() }));
vi.mock("./sentry", () => ({ isServerSentryActive: () => true }));

// D-100.csp-report: the report-only CSP posts violations here. The endpoint
// reads its own raw body (it runs before every body parser), keeps only the
// directive, the blocked host and a scrubbed page path, and sends one scrubbed
// message per (directive, blocked host) pair per UTC day.

const SECRET = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

function legacy(report: Record<string, string>): string {
  return JSON.stringify({ "csp-report": report });
}

function harness(start = Date.parse("2026-10-30T10:00:00Z")) {
  const emitted: Array<Parameters<CspReportEmit>[0]> = [];
  let clock = start;
  const counter = createCspReportCounter({ emit: event => emitted.push(event), now: () => clock });
  const app = express();
  const handle = createCspReportHandler(counter);
  app.post("/api/csp-report", (req, res) => handle(req, res));
  return { app, counter, emitted, setNow: (value: number) => { clock = value; } };
}

describe("parseCspReportBody", () => {
  it("reads the legacy application/csp-report shape", () => {
    const parsed = parseCspReportBody("application/csp-report", legacy({
      "document-uri": "https://skipwait.me/explore?q=jane",
      "blocked-uri": "https://evil.example/x.js?token=abc",
      "effective-directive": "script-src-elem",
    }));
    expect(parsed).toEqual([{ directive: "script-src-elem", blockedHost: "evil.example", documentPath: "/explore" }]);
  });

  it("falls back to violated-directive when effective-directive is absent", () => {
    const parsed = parseCspReportBody("application/csp-report", legacy({
      "document-uri": "https://skipwait.me/",
      "blocked-uri": "inline",
      "violated-directive": "style-src 'self'",
    }));
    expect(parsed).toEqual([{ directive: "style-src", blockedHost: "inline", documentPath: "/" }]);
  });

  it("reads the Reporting API application/reports+json shape and ignores other report types", () => {
    const parsed = parseCspReportBody("application/reports+json", JSON.stringify([
      { type: "csp-violation", url: "https://skipwait.me/plans", body: { documentURL: `https://skipwait.me/fast/${SECRET}?x=1#frag`, blockedURL: "data", effectiveDirective: "img-src" } },
      { type: "deprecation", url: "https://skipwait.me/", body: { id: "x" } },
    ]));
    expect(parsed).toEqual([{ directive: "img-src", blockedHost: "data", documentPath: "/fast/:token" }]);
  });

  it("returns null for malformed JSON, the wrong shape or an unsupported content type", () => {
    expect(parseCspReportBody("application/csp-report", "{not json")).toBeNull();
    expect(parseCspReportBody("application/csp-report", JSON.stringify({ nope: 1 }))).toBeNull();
    expect(parseCspReportBody("application/reports+json", JSON.stringify({ type: "csp-violation" }))).toBeNull();
    expect(parseCspReportBody("text/plain", legacy({ "blocked-uri": "inline", "effective-directive": "script-src" }))).toBeNull();
  });

  it("never keeps a query string, fragment, token segment or path of the blocked resource", () => {
    const parsed = parseCspReportBody("application/csp-report", legacy({
      "document-uri": `https://skipwait.me/email-review/${SECRET}?email=jane%40example.com#top`,
      "blocked-uri": `https://cdn.example.com/u/${SECRET}/a.js?sig=${SECRET}`,
      "effective-directive": "script-src",
    }));
    expect(parsed).toEqual([{ directive: "script-src", blockedHost: "cdn.example.com", documentPath: "/email-review/:token" }]);
    expect(JSON.stringify(parsed)).not.toContain(SECRET);
    expect(JSON.stringify(parsed)).not.toContain("?");
    expect(JSON.stringify(parsed)).not.toContain("#");
  });

  it("collapses unexpected directive or host text to a fixed label instead of logging it", () => {
    const parsed = parseCspReportBody("application/csp-report", legacy({
      "document-uri": "https://skipwait.me/",
      "blocked-uri": "jane@example.com secret words",
      "effective-directive": "script-src<script>",
    }));
    expect(parsed).toEqual([{ directive: "unknown", blockedHost: "other", documentPath: "/" }]);
  });
});

describe("POST /api/csp-report handler", () => {
  it("answers 204 for a valid report, sets no cookie and needs no session", async () => {
    const { app, emitted } = harness();
    const response = await request(app)
      .post("/api/csp-report")
      .set("Content-Type", "application/csp-report")
      .send(legacy({ "document-uri": "https://skipwait.me/ask?job=1", "blocked-uri": "https://evil.example/a.js", "effective-directive": "script-src-elem" }));
    expect(response.status).toBe(204);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(emitted).toHaveLength(1);
  });

  it("accepts application/reports+json", async () => {
    const { app, emitted } = harness();
    const response = await request(app)
      .post("/api/csp-report")
      .set("Content-Type", "application/reports+json")
      .send(JSON.stringify([{ type: "csp-violation", body: { documentURL: "https://skipwait.me/", blockedURL: "eval", effectiveDirective: "script-src" } }]));
    expect(response.status).toBe(204);
    expect(emitted.map(event => event.blockedHost)).toEqual(["eval"]);
  });

  it("answers 400 for a malformed body or an unsupported content type", async () => {
    const { app, emitted } = harness();
    const malformed = await request(app).post("/api/csp-report").set("Content-Type", "application/csp-report").send("{broken");
    expect(malformed.status).toBe(400);
    const wrongType = await request(app).post("/api/csp-report").set("Content-Type", "text/plain").send(legacy({ "blocked-uri": "inline", "effective-directive": "script-src" }));
    expect(wrongType.status).toBe(400);
    expect(emitted).toHaveLength(0);
  });

  it("answers 413 for a body over 8 KB and records nothing", async () => {
    const { app, emitted } = harness();
    const big = legacy({ "document-uri": "https://skipwait.me/", "blocked-uri": "inline", "effective-directive": "script-src", pad: "x".repeat(CSP_REPORT_MAX_BYTES) });
    const response = await request(app).post("/api/csp-report").set("Content-Type", "application/csp-report").send(big);
    expect(response.status).toBe(413);
    expect(emitted).toHaveLength(0);
  });

  it("accepts a body of exactly 8 KB", async () => {
    const { app } = harness();
    const base = legacy({ "document-uri": "https://skipwait.me/", "blocked-uri": "inline", "effective-directive": "script-src", pad: "" });
    const body = legacy({ "document-uri": "https://skipwait.me/", "blocked-uri": "inline", "effective-directive": "script-src", pad: "x".repeat(CSP_REPORT_MAX_BYTES - Buffer.byteLength(base)) });
    expect(Buffer.byteLength(body)).toBe(CSP_REPORT_MAX_BYTES);
    const response = await request(app).post("/api/csp-report").set("Content-Type", "application/csp-report").send(body);
    expect(response.status).toBe(204);
  });
});

describe("createCspReportCounter", () => {
  const violation = { directive: "script-src-elem", blockedHost: "evil.example", documentPath: "/explore" };

  it("counts every report but emits once per (directive, blocked host) per UTC day", () => {
    const { counter, emitted, setNow } = harness(Date.parse("2026-10-30T23:59:00Z"));
    counter.record(violation);
    counter.record({ ...violation, documentPath: "/plans" });
    counter.record({ ...violation, blockedHost: "other.example" });
    expect(counter.count("script-src-elem", "evil.example")).toBe(2);
    expect(emitted.map(event => event.blockedHost)).toEqual(["evil.example", "other.example"]);
    setNow(Date.parse("2026-10-31T00:00:01Z"));
    counter.record(violation);
    expect(emitted.map(event => event.blockedHost)).toEqual(["evil.example", "other.example", "evil.example"]);
    expect(counter.count("script-src-elem", "evil.example")).toBe(1);
  });

  it("emits a scrubbed message with only the directive, blocked host, page path and UTC day", () => {
    const { counter, emitted } = harness();
    counter.record(violation);
    expect(emitted).toEqual([{ day: "2026-10-30", directive: "script-src-elem", blockedHost: "evil.example", documentPath: "/explore", message: "CSP report-only violation: script-src-elem blocked evil.example on /explore" }]);
  });

  it("stops tracking new pairs past the daily cap and says so once", () => {
    const emitted: Array<Parameters<CspReportEmit>[0]> = [];
    const counter = createCspReportCounter({ emit: event => emitted.push(event), now: () => Date.parse("2026-10-30T10:00:00Z"), maxPairsPerDay: 2 });
    counter.record({ ...violation, blockedHost: "a.example" });
    counter.record({ ...violation, blockedHost: "b.example" });
    counter.record({ ...violation, blockedHost: "c.example" });
    counter.record({ ...violation, blockedHost: "d.example" });
    expect(emitted.map(event => event.blockedHost)).toEqual(["a.example", "b.example", "*"]);
    expect(emitted[2]?.message).toBe("CSP report-only: daily limit of 2 distinct violations reached; further new pairs are not reported today");
    expect(counter.count("script-src-elem", "c.example")).toBe(0);
  });
});

// Instinct's privacy qualification on #883: report fields are client-supplied,
// so the page path that reaches a log line or Sentry is one of a fixed set of
// route templates (client/src/App.tsx), an `/api/*` bucket, or `/:unknown`.
// No segment of the reported path is ever echoed.
const CANARY = "pvcanary7q";

function pagePathOf(documentUri: string | undefined): string | undefined {
  const report: Record<string, string> = { "blocked-uri": "inline", "effective-directive": "script-src" };
  if (documentUri !== undefined) report["document-uri"] = documentUri;
  return parseCspReportBody("application/csp-report", legacy(report))?.[0]?.documentPath;
}

describe("page path privacy contract (route template, API bucket or unknown)", () => {
  it.each([
    ["https://skipwait.me/explore/acme-corp", "/explore/:slug"],
    [`https://skipwait.me/p/${CANARY}`, "/p/:handle"],
    [`https://skipwait.me/refer/acme/${CANARY}`, "/refer/:companySlug/:token"],
    [`https://skipwait.me/refer/${CANARY}/${SECRET}`, "/refer/:companySlug/:token"],
    [`https://skipwait.me/admin/approvals/${CANARY}/123`, "/admin/approvals/:kind/:id"],
    [`https://skipwait.me/conversation/${CANARY}`, "/conversation/:requestId"],
    [`https://skipwait.me/thread/${CANARY}`, "/thread/:requestId"],
    [`https://skipwait.me/company/dashboard/${CANARY}`, "/company/dashboard/:slug"],
    [`https://skipwait.me/share-card/${CANARY}`, "/share-card/:token"],
    [`https://skipwait.me/Explore/?q=${CANARY}#${CANARY}`, "/explore"],
  ])("reduces a known route %s to its template", (documentUri, template) => {
    expect(pagePathOf(documentUri)).toBe(template);
  });

  it.each([
    `https://skipwait.me/unknown-route/${CANARY}?secret=x`,
    `https://skipwait.me/${CANARY}`,
    `https://skipwait.me/fast/${SECRET}/${CANARY}`,
    `https://skipwait.me/email-review/${SECRET}/${CANARY}`,
    `https://skipwait.me/explore/acme/${CANARY}`,
    `https://skipwait.me/plans/${CANARY}`,
    "https://skipwait.me/components",
    `https://skipwait.me/%2e%2e/${CANARY}`,
    `https://skipwait.me/explore%2F${CANARY}`,
  ])("buckets an unknown path or a suffix after a template as /:unknown: %s", documentUri => {
    expect(pagePathOf(documentUri)).toBe("/:unknown");
  });

  it("buckets every API path as /api/* with no segment kept", () => {
    expect(pagePathOf(`https://skipwait.me/api/${CANARY}/x?y=1`)).toBe("/api/*");
    expect(pagePathOf("https://skipwait.me/api")).toBe("/api/*");
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["a scheme with no path", `javascript:${CANARY}`],
    ["about:blank", "about:blank"],
    ["unparseable text", `http://[${CANARY}`],
    ["a data URL", `data:text/html,${CANARY}`],
  ])("buckets a %s document as /:unknown", (_label, documentUri) => {
    expect(pagePathOf(documentUri)).toBe("/:unknown");
  });

  it("names every production route in client/src/App.tsx, and nothing else", () => {
    const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    const routes = new Set<string>();
    for (const line of app.split("\n")) {
      if (line.includes("import.meta.env.DEV")) continue;
      const match = line.match(/<Route path="([^"]+)"/);
      if (match?.[1]) routes.add(match[1].replace(/:[A-Za-z]+/g, ":param").toLowerCase());
    }
    const templates = new Set(cspReport.CSP_PAGE_ROUTE_TEMPLATES.map(template => template.replace(/:[A-Za-z]+/g, ":param").toLowerCase()));
    expect(routes.size).toBeGreaterThan(80);
    expect([...templates].sort()).toEqual([...routes].sort());
  });
});

describe("live /api/csp-report emits no client-supplied canary (log line and Sentry message/tags)", () => {
  afterEach(() => vi.restoreAllMocks());

  let host = 0;
  const nextHost = () => `h${++host}-${Date.now()}.example`;

  async function emitted(contentType: string, body: string) {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const capture = vi.mocked(Sentry.captureMessage);
    capture.mockClear();
    const app = express();
    app.post("/api/csp-report", (req, res) => handleCspReport(req, res));
    const response = await request(app).post("/api/csp-report").set("Content-Type", contentType).send(body);
    return { status: response.status, text: JSON.stringify([warn.mock.calls, capture.mock.calls]).toLowerCase() };
  }

  it("legacy shape: canaries in path, query, fragment, referrer, source file, sample and policy never reach the log or Sentry", async () => {
    const { status, text } = await emitted("application/csp-report", JSON.stringify({ "csp-report": {
      "document-uri": `https://skipwait.me/unknown-route/${CANARY}?secret=${CANARY}#${CANARY}`,
      "blocked-uri": `https://${nextHost()}/${CANARY}?q=${CANARY}`,
      "effective-directive": "script-src",
      referrer: `https://skipwait.me/p/${CANARY}?r=${CANARY}`,
      "source-file": `https://skipwait.me/assets/${CANARY}.js?v=${CANARY}`,
      "script-sample": CANARY,
      "original-policy": `default-src 'self'; report-uri /${CANARY}`,
      disposition: CANARY,
      "line-number": 1,
    } }));
    expect(status).toBe(204);
    expect(text).toContain("/:unknown");
    expect(text).not.toContain(CANARY);
  });

  it("Reporting API shape: canaries in url, documentURL, referrer, sourceFile and sample never reach the log or Sentry", async () => {
    const { status, text } = await emitted("application/reports+json", JSON.stringify([{
      type: "csp-violation",
      url: `https://skipwait.me/${CANARY}`,
      user_agent: CANARY,
      body: {
        documentURL: `https://skipwait.me/explore/acme/${CANARY}?x=${CANARY}`,
        blockedURL: `https://${nextHost()}/${CANARY}`,
        effectiveDirective: "img-src",
        referrer: `https://skipwait.me/${CANARY}`,
        sourceFile: `https://skipwait.me/${CANARY}.js`,
        sample: CANARY,
        originalPolicy: CANARY,
      },
    }]));
    expect(status).toBe(204);
    expect(text).toContain("/:unknown");
    expect(text).not.toContain(CANARY);
  });

  it("a personal parameter on a known route reaches the log and Sentry only as its template", async () => {
    const { text } = await emitted("application/csp-report", legacy({
      "document-uri": `https://skipwait.me/p/${CANARY}`,
      "blocked-uri": `https://${nextHost()}/x.js`,
      "effective-directive": "script-src-elem",
    }));
    expect(text).toContain("/p/:handle");
    expect(text).not.toContain(CANARY);
  });
});

describe("directive label is a known CSP directive or unknown (separable hardening)", () => {
  it.each(["script-src-elem", "style-src-attr", "img-src", "frame-ancestors", "form-action", "default-src", "require-trusted-types-for"])("keeps the known directive %s", directive => {
    expect(parseCspReportBody("application/csp-report", legacy({ "document-uri": "https://skipwait.me/", "blocked-uri": "inline", "effective-directive": directive }))?.[0]?.directive).toBe(directive);
  });

  // Letters and hyphens only, so it passes the old shape check and only an allow-list stops it.
  const DIRECTIVE_CANARY = "pvdirectivecanary";

  it("collapses a well-formed but unknown directive to unknown, in both report shapes", () => {
    expect(parseCspReportBody("application/csp-report", legacy({ "document-uri": "https://skipwait.me/", "blocked-uri": "inline", "violated-directive": `${DIRECTIVE_CANARY}-src 'self'` }))?.[0]?.directive).toBe("unknown");
    expect(parseCspReportBody("application/reports+json", JSON.stringify([{ type: "csp-violation", body: { documentURL: "https://skipwait.me/", blockedURL: "inline", effectiveDirective: DIRECTIVE_CANARY } }]))?.[0]?.directive).toBe("unknown");
  });
});
