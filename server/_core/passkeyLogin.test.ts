/**
 * The passkey routes stay closed while the in-code flag is off (D-097):
 * every endpoint answers 404 and no challenge or credential is written.
 */
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPasskeyLoginRoutes } from "./passkeyLogin";

function app() {
  const a = express();
  a.use(express.json());
  registerPasskeyLoginRoutes(a, { resolveIdentity: async () => ({ account: { openId: "u_test", email: "s@example.com", name: "S", loginMethod: "google" } }) });
  return a;
}

describe("passkey routes with the flag off", () => {
  it.each([
    "/api/auth/passkey/register/options",
    "/api/auth/passkey/register/verify",
    "/api/auth/passkey/login/options",
    "/api/auth/passkey/login/verify",
  ])("POST %s -> 404", async (path) => {
    const res = await request(app()).post(path).send({});
    expect(res.status).toBe(404);
  });
});
