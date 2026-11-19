import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTransactionalEmailSender } from "../emailDelivery";
import { modelRouterConfigured } from "./modelRouter";
import { isolateLiveOutboundCredentials, LIVE_CREDENTIAL_OPT_IN_ENV_KEY, LIVE_OUTBOUND_CREDENTIAL_ENV_KEYS } from "./testCredentialGuard";

const optedIntoLiveCredentials = process.env[LIVE_CREDENTIAL_OPT_IN_ENV_KEY] === "true";

describe("the environment a spec inherits", () => {
  // Skipped only when the operator asked for live credential tests, which is the
  // one case where these keys are meant to be present.
  it.skipIf(optedIntoLiveCredentials)("holds no live provider credential", () => {
    expect(LIVE_OUTBOUND_CREDENTIAL_ENV_KEYS.filter(key => process.env[key])).toEqual([]);
  });

  it.skipIf(optedIntoLiveCredentials)("gives an unstubbed email sender no provider to reach", async () => {
    // The sender resolves its key at call time and would use the real network
    // layer, so `not_configured` here is the guard working rather than a stub
    // agreeing with itself.
    const send = createTransactionalEmailSender();
    await expect(send({ to: "member@example.test", subject: "guard", text: "guard" })).resolves.toEqual({ sent: false, reason: "not_configured" });
  });

  it.skipIf(optedIntoLiveCredentials)("leaves the model router with no provider configured", () => {
    // Otherwise a configured `AI_*` triple would send a member's prompt and
    // workspace context to a third party from `pnpm test`.
    expect(modelRouterConfigured()).toBe(false);
  });
});

describe("isolateLiveOutboundCredentials", () => {
  it("removes every listed credential and reports the ones that held a value", () => {
    const env: Record<string, string | undefined> = { JWT_SECRET: "local", DATABASE_URL: "mysql://localhost/dev" };
    for (const key of LIVE_OUTBOUND_CREDENTIAL_ENV_KEYS) env[key] = "live-value";
    expect([...isolateLiveOutboundCredentials(env)].sort()).toEqual([...LIVE_OUTBOUND_CREDENTIAL_ENV_KEYS].sort());
    expect(env).toEqual({ JWT_SECRET: "local", DATABASE_URL: "mysql://localhost/dev" });
  });

  it("has nothing to do in an environment that holds no credentials", () => {
    expect(isolateLiveOutboundCredentials({ NODE_ENV: "test" })).toEqual([]);
  });

  it("treats an empty value as already inert", () => {
    expect(isolateLiveOutboundCredentials({ ZEPTOMAIL_API_KEY: "" })).toEqual([]);
  });

  it("keeps every credential when the operator opted into live credential tests", () => {
    const env: Record<string, string | undefined> = { ZEPTOMAIL_API_KEY: "live", [LIVE_CREDENTIAL_OPT_IN_ENV_KEY]: "true" };
    expect(isolateLiveOutboundCredentials(env)).toEqual([]);
    expect(env.ZEPTOMAIL_API_KEY).toBe("live");
  });

  it("recognises only the exact documented opt-in value", () => {
    const env: Record<string, string | undefined> = { ZEPTOMAIL_API_KEY: "live", [LIVE_CREDENTIAL_OPT_IN_ENV_KEY]: "TRUE" };
    expect(isolateLiveOutboundCredentials(env)).toEqual(["ZEPTOMAIL_API_KEY"]);
  });
});

describe("the credential list itself", () => {
  function nonTestServerSource(): string {
    const chunks: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) chunks.push(readFileSync(path, "utf8"));
      }
    };
    walk(fileURLToPath(new URL("..", import.meta.url)));
    return chunks.join("\n");
  }

  const source = nonTestServerSource();

  it("lists only credentials production source actually reads", () => {
    const unread = LIVE_OUTBOUND_CREDENTIAL_ENV_KEYS.filter(key => !source.includes(`process.env.${key}`) && !source.includes(`env.${key}`));
    expect(unread).toEqual([]);
  });

  it("lists only credentials the declared environment contract carries", () => {
    // AGENTS.md makes .env.example the contract for every config key, so a guard
    // that names an undeclared key is out of sync with deployment truth.
    const declared = readFileSync(fileURLToPath(new URL("../../.env.example", import.meta.url)), "utf8");
    const undeclared = LIVE_OUTBOUND_CREDENTIAL_ENV_KEYS.filter(key => !declared.includes(`\n${key}=`));
    expect(undeclared).toEqual([]);
  });
});
