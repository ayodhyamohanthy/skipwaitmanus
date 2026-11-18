import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const captureMessage = vi.fn();
const captureException = vi.fn();

vi.mock("@sentry/node", () => ({
  captureMessage: (...args: unknown[]) => captureMessage(...args),
  captureException: (...args: unknown[]) => captureException(...args),
  init: vi.fn(),
  flush: vi.fn(async () => true),
}));

vi.mock("./sentry", async importOriginal => {
  const original = await importOriginal<typeof import("./sentry")>();
  return { ...original, isServerSentryActive: () => process.env.TEST_SENTRY_ACTIVE === "true" };
});

vi.mock("./db", () => ({
  recordOperationalActivity: vi.fn(async () => undefined),
}));

import { httpErrorCaptureMiddleware, isClientTrpcCode, markErrorReported, routeTemplateOf } from "./httpErrorCapture";
import { materialErrorAlertMiddleware, sendAdminAlertEmail } from "./errorAlerting";
import { initServerSentry, sentryErrorMiddleware } from "./sentry";

afterEach(() => {
  captureMessage.mockClear();
  captureException.mockClear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function apiApp(active: boolean) {
  vi.stubEnv("TEST_SENTRY_ACTIVE", active ? "true" : "false");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("ERROR_ALERT_FROM_EMAIL", "noreply@skipwait.me");
  const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchImpl);
  const app = express();
  app.use(httpErrorCaptureMiddleware);
  app.use(materialErrorAlertMiddleware);
  return { app, fetchImpl };
}

const routeCapture = () => captureMessage.mock.calls.filter(call => call[1]?.fingerprint?.[0] !== "admin-alert");
const adminAlertCapture = () => captureMessage.mock.calls.filter(call => call[1]?.fingerprint?.[0] === "admin-alert");

describe("routeTemplateOf", () => {
  it("uses the literal route pattern, never a path value", async () => {
    const app = express();
    app.get("/api/referrer-review-links/:linkToken/decision", (req, res) => {
      res.status(500).json({ template: routeTemplateOf(req) });
    });
    const response = await request(app).get("/api/referrer-review-links/abc123/decision");
    expect(response.body.template).toBe("/api/referrer-review-links/:linkToken/decision");
  });

  it("uses the tRPC procedure for /api/trpc requests", async () => {
    const app = express();
    app.use("/api/trpc", (req, res) => {
      res.status(500).json({ template: routeTemplateOf(req) });
    });
    const response = await request(app).get("/api/trpc/asks.list?batch=1");
    expect(response.body.template).toBe("/api/trpc/asks.list");
  });

  it("is unmatched when no route matched", async () => {
    const app = express();
    app.use("/api", (req, res) => {
      res.status(500).json({ template: routeTemplateOf(req) });
    });
    const response = await request(app).post("/api/does-not-exist");
    expect(response.body.template).toBe("unmatched");
  });
});

describe("httpErrorCaptureMiddleware", () => {
  it("captures a 5xx answered before the old alert position, keyed on the route template", async () => {
    const { app, fetchImpl } = apiApp(true);
    app.get("/api/auth/otp/send", (_req, res) => res.status(503).json({ error: "provider down" }));

    const response = await request(app).get("/api/auth/otp/send");
    expect(response.status).toBe(503);

    // one route-tagged capture, plus the fixed-subject trace the admin alert raises
    expect(routeCapture()).toHaveLength(1);
    const [message, options] = routeCapture()[0] ?? [];
    expect(String(message)).toBe("skipwait.me GET /api/auth/otp/send 503");
    expect(options).toMatchObject({ fingerprint: ["GET", "/api/auth/otp/send", "503"] });

    // the admin alert fires too, on the same template
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [, alertRequest] = fetchImpl.mock.calls[0] ?? [];
    const alertPayload = JSON.parse(String(alertRequest?.body));
    expect(alertPayload.text).toContain("GET /api/auth/otp/send");
    expect(alertPayload.subject).toBe("skipwait.me error alert · 503");
  });

  it("captures nothing for 4xx or for the readiness probe", async () => {
    const { app, fetchImpl } = apiApp(true);
    app.get("/api/thing/bad", (_req, res) => res.status(400).json({ error: "bad" }));
    app.get("/api/thing/missing", (_req, res) => res.status(404).json({ error: "missing" }));
    app.get("/api/health/ready", (_req, res) => res.status(503).json({ state: "validating" }));

    await request(app).get("/api/thing/bad");
    await request(app).get("/api/thing/missing");
    await request(app).get("/api/health/ready");

    expect(captureMessage).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("captures a tRPC 5xx once, when tRPC did not mark it reported", async () => {
    const { app } = apiApp(true);
    app.use("/api/trpc", (_req, res) => {
      res.status(500).end();
    });
    await request(app).get("/api/trpc/asks.list");
    expect(routeCapture()).toHaveLength(1);
    expect(routeCapture()[0]?.[1]).toMatchObject({ fingerprint: ["GET", "/api/trpc/asks.list", "500"] });
  });

  it("does not capture the route itself when tRPC already marked it reported", async () => {
    const { app } = apiApp(true);
    app.use("/api/trpc", (req, res) => {
      if (req.res) req.res.locals.errorReported = true;
      res.status(500).end();
    });
    // A distinct procedure: the escalator singleton dedupes on method+template+status for 10 minutes.
    await request(app).get("/api/trpc/asks.report");
    expect(routeCapture()).toHaveLength(0);
    // the fixed-subject admin-alert trace still fires
    expect(adminAlertCapture()).toHaveLength(1);
  });

  it("captures nothing when server Sentry is not active", async () => {
    const { app } = apiApp(false);
    app.get("/api/auth/otp/send", (_req, res) => res.status(503).json({ error: "provider down" }));
    await request(app).get("/api/auth/otp/send");
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("does not echo a token value in the fingerprint or the alert", async () => {
    const { app, fetchImpl } = apiApp(true);
    app.get("/api/referrer-review-links/:linkToken/decision", (_req, res) => res.status(500).json({ error: "boom" }));
    const response = await request(app).get("/api/referrer-review-links/tokA1/decision");
    expect(response.status).toBe(500);
    expect(JSON.stringify(captureMessage.mock.calls)).not.toContain("tokA1");
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain("tokA1");
    expect(routeCapture()[0]?.[1]).toMatchObject({ fingerprint: ["GET", "/api/referrer-review-links/:linkToken/decision", "500"] });
  });

  it("captures once when an error reaches the Sentry error middleware", async () => {
    vi.stubEnv("TEST_SENTRY_ACTIVE", "true");
    vi.stubEnv("SENTRY_DSN", "https://examplePublicKey@o0.ingest.sentry.io/0");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("ERROR_ALERT_FROM_EMAIL", "noreply@skipwait.me");
    vi.stubEnv("NODE_ENV", "development");
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchImpl);
    expect(initServerSentry()).toBe(true);
    const app = express();
    app.use(httpErrorCaptureMiddleware);
    app.use(materialErrorAlertMiddleware);
    app.get("/api/auth/otp/send", () => {
      throw new Error("provider exploded");
    });
    app.use(markErrorReported);
    app.use(sentryErrorMiddleware);
    app.use((_error: unknown, _req: express.Request, res: express.Response) => {
      res.status(500).json({ error: "Internal server error" });
    });

    const response = await request(app).get("/api/auth/otp/send");
    expect(response.status).toBe(500);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(routeCapture()).toHaveLength(0);
    // the fixed-subject admin-alert trace still fires
    expect(adminAlertCapture()).toHaveLength(1);
  });
});

describe("registration order pin", () => {
  it("registers both middlewares before the payment webhooks, and markErrorReported before the Sentry error middleware", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
    const at = (needle: string) => {
      const index = source.indexOf(needle);
      expect(index).toBeGreaterThan(-1);
      return index;
    };
    const webhooks = at("registerPaymentWebhookRoutes(app");
    expect(at("app.use(httpErrorCaptureMiddleware)")).toBeLessThan(webhooks);
    expect(at("app.use(materialErrorAlertMiddleware)")).toBeLessThan(webhooks);
    expect(at("app.use(markErrorReported)")).toBeLessThan(at("app.use(sentryErrorMiddleware)"));
    // the tRPC onError skips caller-fixable codes and marks a capture reported
    const onErrorStart = source.indexOf("onError({ error, path, req })");
    expect(onErrorStart).toBeGreaterThan(-1);
    const onErrorBlock = source.slice(onErrorStart, onErrorStart + 400);
    expect(onErrorBlock).toContain("isClientTrpcCode(error.code)");
    expect(onErrorBlock).toContain("errorReported");
    // the old late registration is gone
    expect(source.indexOf("app.use(materialErrorAlertMiddleware)")).toBe(source.lastIndexOf("app.use(materialErrorAlertMiddleware)"));
  });
});

describe("isClientTrpcCode", () => {
  it("treats caller-fixable tRPC codes as client errors", () => {
    for (const code of ["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "TOO_MANY_REQUESTS", "CONFLICT", "PRECONDITION_FAILED"]) {
      expect(isClientTrpcCode(code)).toBe(true);
    }
    expect(isClientTrpcCode("INTERNAL_SERVER_ERROR")).toBe(false);
    expect(isClientTrpcCode("PARSE_ERROR")).toBe(false);
    expect(isClientTrpcCode(undefined)).toBe(false);
  });
});

describe("sendAdminAlertEmail second channel", () => {
  it("raises a fixed-subject Sentry message even when the email fails", async () => {
    vi.stubEnv("TEST_SENTRY_ACTIVE", "true");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("ERROR_ALERT_FROM_EMAIL", "noreply@skipwait.me");
    const fetchImpl = vi.fn(async () => new Response("{\"error\":\"nope\"}", { status: 500 }));
    await sendAdminAlertEmail(fetchImpl as never, { subject: "skipwait.me payment needs review · #1234", text: "body" }).catch(() => undefined);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    const [message, options] = captureMessage.mock.calls[0] ?? [];
    expect(String(message)).toBe("skipwait.me payment needs review");
    expect(JSON.stringify(options)).not.toContain("#1234");
    expect(options).toMatchObject({ fingerprint: ["admin-alert", "skipwait.me payment needs review"] });
  });
});
