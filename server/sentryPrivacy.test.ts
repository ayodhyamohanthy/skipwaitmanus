// Sentry must never receive what people type into sign-in forms (passwords, emails, WorkOS reset tokens), their
// cookies and auth headers, or query strings. This boots the real Sentry SDK over the real seeker password
// routes, with a capturing transport so nothing leaves the process: the SDK records incoming request bodies by
// default, and the route tests mock Sentry out, so only a test like this one can see what is actually sent.
import http from "node:http";
import type { AddressInfo } from "node:net";
import * as Sentry from "@sentry/node";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createMemoryDurableLimitStore } from "./_core/memoryDurableLimitStore";
import type { PasswordWorkosClient } from "./_core/passwordWorkosClient";

vi.mock("./db", () => ({ getDb: vi.fn(async () => null), recordOperationalActivity: vi.fn(async () => undefined) }));

const SECRETS = {
  password: "CorrectHorse!42-secret",
  email: "victim@example.com",
  forgotEmail: "forgot.victim@example.com",
  resetToken: "wos_reset_TOKEN_123456",
  newPassword: "BrandNew!Secret9",
  sessionCookie: "SESSIONSECRET123",
  ticketCookie: "TICKETSECRET456",
  bearer: "BEARERSECRET789",
  query: "QUERYSECRET000",
  refererToken: "REFERERTOKEN111",
  apiKey: "sk_live_APIKEYSECRET",
} as const;

type EnvelopeItem = { readonly type: string; readonly payload: Record<string, unknown> };
const wire: string[] = [];
let upstream: http.Server;
let upstreamUrl = "";

/** What the WorkOS SDK throws: its message and rawData name the email. */
function workosFailure(message: string): Error {
  return Object.assign(new Error(message), { name: "GenericServerException", status: 500, requestID: "req_privacy", rawData: { message } });
}

let resetRequested: () => void = () => undefined;
const resetDone = new Promise<void>(resolve => { resetRequested = resolve; });
const client: PasswordWorkosClient = {
  authenticateWithPassword: async ({ email }) => { throw workosFailure(`Upstream failed for ${email}`); },
  createUser: async () => { throw workosFailure("unused"); },
  listUsers: async ({ email }) => {
    // What the SDK does on the wire: the email in the query string, the API key in a header.
    await fetch(`${upstreamUrl}/user_management/users?email=${encodeURIComponent(email)}&limit=1`, { headers: { Authorization: `Bearer ${SECRETS.apiKey}` } });
    return { data: [{ id: "user_1", email, emailVerified: true }] };
  },
  createPasswordReset: async ({ email }) => {
    setImmediate(resetRequested);
    return { passwordResetToken: SECRETS.resetToken, passwordResetUrl: `https://exemplary-refuge-51.authkit.app/reset-password?token=${SECRETS.resetToken}&email=${email}` };
  },
  resetPassword: async () => { throw workosFailure(`Reset failed for ${SECRETS.resetToken}`); },
};

function itemsOf(body: string): EnvelopeItem[] {
  const lines = body.split("\n").filter(line => line.trim() !== "");
  const items: EnvelopeItem[] = [];
  for (let index = 1; index + 1 < lines.length; index += 2) {
    const header: { type?: string } = JSON.parse(lines[index]);
    items.push({ type: header.type ?? "unknown", payload: JSON.parse(lines[index + 1]) });
  }
  return items;
}

function withBrowserHeaders(test: request.Test): request.Test {
  return test
    .set("Origin", "https://skipwait.me")
    .set("Cookie", `app_session_id=${SECRETS.sessionCookie}; pw_verify=${SECRETS.ticketCookie}`)
    .set("Authorization", `Bearer ${SECRETS.bearer}`)
    .set("Referer", `https://skipwait.me/reset-password?token=${SECRETS.refererToken}`);
}

beforeAll(async () => {
  upstream = http.createServer((_req, res) => { res.setHeader("Content-Type", "application/json"); res.end('{"data":[]}'); });
  await new Promise<void>(resolve => upstream.listen(0, "127.0.0.1", resolve));
  upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  Object.assign(process.env, { SENTRY_DSN: "https://publickey@o0.ingest.sentry.io/0", PUBLIC_BASE_URL: "https://skipwait.me", WORKOS_COOKIE_PASSWORD: "c".repeat(32) });
  const { initServerSentry } = await import("./sentry");
  const transport = (options: Parameters<typeof Sentry.createTransport>[0]) => Sentry.createTransport(options, async ({ body }) => {
    wire.push(typeof body === "string" ? body : new TextDecoder().decode(body));
    return { statusCode: 200 };
  });
  expect(initServerSentry({ transport, tracesSampleRate: 1 })).toBe(true);
});

afterAll(async () => {
  await Sentry.close(2000);
  await new Promise<void>(resolve => upstream.close(() => resolve()));
  delete process.env.SENTRY_DSN;
});

describe("server Sentry privacy (real SDK, real password routes)", () => {
  it("never sends a password, email, reset token, cookie, auth header or query string", async () => {
    const { registerPasswordAuthRoutes } = await import("./_core/passwordAuthRoutes");
    const { flushServerSentry } = await import("./sentry");
    const app = express();
    app.use(express.json());
    registerPasswordAuthRoutes(app, { client, store: createMemoryDurableLimitStore(), emailStanding: async () => "unknown", sendEmail: async () => ({ sent: true, reason: "sent" }) });

    const signIn = await withBrowserHeaders(request(app).post(`/api/auth/password/sign-in?debug=${SECRETS.query}`)).send({ email: SECRETS.email, password: SECRETS.password });
    expect(signIn.status).toBe(503);
    const reset = await withBrowserHeaders(request(app).post("/api/auth/password/reset/confirm")).send({ token: SECRETS.resetToken, password: SECRETS.newPassword, confirm: SECRETS.newPassword });
    expect(reset.status).toBe(503);
    // A successful request: sampled transactions carry request data even when nothing fails.
    const forgot = await withBrowserHeaders(request(app).post("/api/auth/password/forgot")).send({ email: SECRETS.forgotEmail });
    expect(forgot.status).toBe(200);
    await resetDone;
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(await flushServerSentry(5000)).toBe(true);

    const items = wire.flatMap(itemsOf);
    const events = items.filter(item => item.type === "event").map(item => item.payload);
    const transactions = items.filter(item => item.type === "transaction").map(item => item.payload);
    // Not vacuous: the three reported failures and the request transactions all reached the transport.
    expect(events.map(event => (event.exception as { values: Array<{ value: string }> }).values[0].value).sort()).toEqual([
      "Seeker password reset failed: temporarily_unavailable",
      "Seeker password sign_in failed: temporarily_unavailable",
      "WorkOS password reset URL is not skipwait.me/reset-password",
    ]);
    expect(transactions.length).toBeGreaterThanOrEqual(3);
    const signInEvent = events.find(event => JSON.stringify(event).includes("sign_in failed"));
    expect((signInEvent?.request as { url?: string } | undefined)?.url).toMatch(/\/api\/auth\/password\/sign-in$/);
    // The outgoing WorkOS-style call was recorded (so its query string really was removed, not just absent).
    const crumbs = events.flatMap(event => (event.breadcrumbs as Array<{ category?: string; data?: Record<string, unknown> }> | undefined) ?? []);
    const upstreamCrumb = crumbs.find(crumb => crumb.category === "http" && String(crumb.data?.url ?? "").endsWith("/user_management/users"));
    expect(upstreamCrumb?.data).toBeDefined();
    expect(upstreamCrumb?.data).not.toHaveProperty("http.query");

    const everything = wire.join("\n");
    for (const [name, secret] of Object.entries(SECRETS)) expect(everything, name).not.toContain(secret);
    for (const email of [SECRETS.email, SECRETS.forgotEmail]) expect(everything).not.toContain(encodeURIComponent(email));
  });
});
