import * as Sentry from "@sentry/node";
import express from "express";
import http from "node:http";
import { afterAll, describe, expect, it, vi } from "vitest";

const BODY = {
  email: "seeker@example.invalid",
  password: "fixture-password-value",
  token: "fixture-reset-token",
};
const COOKIE = "fixture-session-cookie";
const BEARER = "fixture-authorization-header";

// The real HTTP integration over local Express routes. Both the directory
// call and the Sentry transport are local fixtures, so no provider is contacted.
afterAll(async () => {
  await Sentry.close(2000);
  vi.unstubAllEnvs();
});

describe("server Sentry transport privacy", () => {
  it("keeps credentials out of error events, request breadcrumbs and sampled HTTP transactions", async () => {
    vi.stubEnv("SENTRY_DSN", "https://publickey@sentry.invalid/1");
    const wire: string[] = [];
    const transport: NonNullable<Sentry.NodeOptions["transport"]> = options => Sentry.createTransport(options, async ({ body }) => {
      wire.push(typeof body === "string" ? body : new TextDecoder().decode(body));
      return { statusCode: 200 };
    });
    const { captureServerError, flushServerSentry, initServerSentry } = await import("./sentry");
    expect(initServerSentry({ transport, tracesSampleRate: 1 })).toBe(true);

    const app = express();
    app.use(express.json());
    app.get("/fixture/users", (_req, res) => { res.json({ data: [] }); });
    let baseUrl: string;
    app.post("/api/auth/password/reset/confirm", async (_req, res) => {
      await fetch(`${baseUrl}/fixture/users?email=${encodeURIComponent(BODY.email)}`, {
        headers: { Authorization: `Bearer ${BEARER}` },
      });
      captureServerError(new Error("Password route privacy probe"));
      res.status(503).end();
    });
    const server = http.createServer(app);
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not bind a local port");
      baseUrl = `http://127.0.0.1:${address.port}`;
      const response = await fetch(`${baseUrl}/api/auth/password/reset/confirm?token=${BODY.token}`, {
        method: "POST",
        body: JSON.stringify(BODY),
        headers: {
          "Content-Type": "application/json",
          Cookie: `app_session_id=${COOKIE}`,
          Authorization: `Bearer ${BEARER}`,
          Referer: `https://skipwait.me/reset-password?token=${BODY.token}#private-section`,
        },
      });
      expect(response.status).toBe(503);
      expect(await flushServerSentry(5000)).toBe(true);
    } finally {
      await new Promise<void>(resolve => { server.close(() => resolve()); });
    }

    const sent = wire.join("\n");
    expect(sent).toContain("Password route privacy probe");
    expect(sent).toContain('"type":"transaction"');
    expect(sent).toContain(`"url":"${baseUrl}/api/auth/password/reset/confirm"`);
    expect(sent).toContain(`"url":"${baseUrl}/fixture/users"`);
    expect(sent).toContain("https://skipwait.me/reset-password");
    for (const secret of [...Object.values(BODY), encodeURIComponent(BODY.email), COOKIE, BEARER, "private-section"]) {
      expect(sent).not.toContain(secret);
    }
  });
});
