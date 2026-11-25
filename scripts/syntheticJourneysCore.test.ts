// REL-synthetic-journeys: pure local preparation, never a preview execution.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { planLocalSyntheticJourneys } from "./syntheticJourneysCore.mjs";

const DATABASE_URL = "mysql://fixture:fixture-password@127.0.0.1:3306/skipwait_qa";
const OPTIONS_ERROR = "Invalid local synthetic journey options.";
const DATABASE_ERROR = "Local synthetic journeys require a loopback QA MySQL URL.";

function ready(options = {}) {
  const plan = planLocalSyntheticJourneys({ enabled: true, databaseUrl: DATABASE_URL, ...options });
  if (!("env" in plan)) throw new Error("Expected an enabled plan");
  return plan;
}

describe("planLocalSyntheticJourneys", () => {
  it("defaults off and returns no credentials or environment even when supplied", () => {
    expect(planLocalSyntheticJourneys()).toEqual({ enabled: false });
    expect(planLocalSyntheticJourneys({
      enabled: false,
      databaseUrl: "mysql://fixture:private-password@production.example/production",
      sourceEnv: { WORKOS_API_KEY: "private-auth", DATABASE_URL, NODE_OPTIONS: "--inspect" },
    })).toEqual({ enabled: false });
  });

  it("plans the complete existing suite on the fixed local browser target", () => {
    const plan = ready();
    expect(plan).toEqual({
      enabled: true,
      baseURL: "http://127.0.0.1:3100",
      command: ["pnpm", "e2e"],
      env: {
        CI: "true", NODE_ENV: "test", TZ: "UTC", LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8",
        E2E_PORT: "3100", PORT: "3100", E2E_DATABASE_URL: DATABASE_URL, DATABASE_URL,
        VITE_APP_ID: "skipwait", BILLING_ENV: "test",
        CHARGEBEE_SITE: "e2e-placeholder", CHARGEBEE_API_KEY: "e2e-placeholder",
        CHARGEBEE_WEBHOOK_SECRET: "e2e-placeholder",
      },
    });
    const packageJson = z.object({ scripts: z.object({ e2e: z.string() }) })
      .parse(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")));
    expect(packageJson.scripts.e2e).toBe("playwright test -c e2e/playwright.config.ts");
    const config = readFileSync(new URL("../e2e/playwright.config.ts", import.meta.url), "utf8");
    expect(config).toContain('testMatch: "*.e2e.ts"');
  });

  it.each([1024, 3210, 65535])("uses explicit browser port %s for both server and browser", port => {
    const plan = ready({ port });
    expect(plan.baseURL).toBe(`http://127.0.0.1:${port}`);
    expect(plan.env.E2E_PORT).toBe(String(port));
    expect(plan.env.PORT).toBe(String(port));
  });

  it.each([
    "mysql://fixture:fixture-password@localhost/qa",
    "mysql://fixture:fixture-password@localhost:3307/qa_e2e",
    "mysql://fixture:fixture-password@127.0.0.1:3306/skipwait_qa",
    `mysql://fixture:fixture-password@127.0.0.1/qa_${"a".repeat(61)}`,
  ])("accepts a loopback URL with a QA database: %s", databaseUrl => {
    const plan = ready({ databaseUrl });
    expect(plan.env.DATABASE_URL).toBe(databaseUrl);
    expect(plan.env.E2E_DATABASE_URL).toBe(databaseUrl);
  });

  it.each([
    undefined, "", "not-a-url", "https://localhost/qa", "mysql:/localhost/qa",
    "mysql://fixture:private-password@production.example/qa",
    "mysql://localhost.evil.example/qa", "mysql://localhost./qa",
    "mysql://127.0.0.1.evil.example/qa", "mysql://[::1]/qa",
    "mysql://[::ffff:127.0.0.1]/qa", "mysql://127.1/qa", "mysql://2130706433/qa",
    "mysql://0x7f000001/qa", "mysql://127.000.000.001/qa",
    "mysql://localhost/skipwait", "mysql://localhost/production", "mysql://localhost/squad",
    "mysql://localhost/no_qaish", "mysql://localhost/", "mysql://localhost/qa/extra",
    "mysql://localhost/extra/../qa", "mysql://localhost/qa/", "mysql://localhost/qa-name",
    "mysql://localhost/%71a", `mysql://localhost/qa_${"a".repeat(62)}`,
    "mysql://localhost/qa?host=production.example", "mysql://localhost/qa?socketPath=/tmp/mysql.sock",
    "mysql://localhost/qa?", "mysql://localhost/qa#private-fragment", "mysql://localhost/qa#",
    "mysql://localhost:0/qa", "mysql://localhost:65536/qa", "mysql://localhost:abc/qa",
    "mysql://localhost:/qa", " mysql://localhost/qa", "mysql://local\nhost/qa",
    "mysql://fixture:bad%ZZ@localhost/qa",
  ])("refuses unsafe or malformed database fixture %# with a static error", databaseUrl => {
    expect(() => ready({ databaseUrl })).toThrowError(new Error(DATABASE_ERROR));
  });

  it.each(["true", "false", 1, 0, null, {}, []])("rejects non-boolean enablement fixture %#", enabled => {
    expect(() => planLocalSyntheticJourneys({ enabled, databaseUrl: DATABASE_URL }))
      .toThrowError(new Error(OPTIONS_ERROR));
  });

  it.each([1023, 65536, -1, 3100.5, NaN, Infinity, "3100", null])("rejects browser port fixture %#", port => {
    expect(() => ready({ port })).toThrowError(new Error(OPTIONS_ERROR));
  });

  it("refuses an extra browser target without reflecting its value or key", () => {
    expect(() => planLocalSyntheticJourneys({ target: "https://private-target.example/private-token" }))
      .toThrowError(new Error(OPTIONS_ERROR));
    expect(() => ready({ baseURL: "https://private-target.example/private-token" }))
      .toThrowError(new Error(OPTIONS_ERROR));
    expect(() => ready({ "private-option-name": "private-option-value" }))
      .toThrowError(new Error(OPTIONS_ERROR));
  });

  it("copies only platform strings, replacing or dropping every supplied service setting", () => {
    const sourceEnv = Object.freeze({
      PATH: "/fixture/bin", TMPDIR: "/fixture/tmp", TMP: "/fixture/tmp2", TEMP: "/fixture/tmp3",
      SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows",
      CI: "false", NODE_ENV: "production", TZ: "Asia/Kolkata", LANG: "en_IN", LC_ALL: "en_IN",
      E2E_PORT: "443", PORT: "443", E2E_DATABASE_URL: "private-database", DATABASE_URL: "private-database",
      VITE_APP_ID: "private-app", BILLING_ENV: "live", CHARGEBEE_SITE: "private-site",
      CHARGEBEE_API_KEY: "private-key", CHARGEBEE_WEBHOOK_SECRET: "private-webhook",
      WORKOS_API_KEY: "private-auth", R2_SECRET_ACCESS_KEY: "private-storage",
      ZEPTOMAIL_API_KEY: "private-mail", SENTRY_DSN: "private-alert", JWT_SECRET: "private-session",
      REVIEWER_LOGIN_ENABLED: "true", SKIPWAIT_ADMIN_EMAIL: "private-admin",
      NODE_OPTIONS: "--require /private/inject.js", NODE_PATH: "/private/modules",
      npm_config_userconfig: "/private/npmrc", NPM_CONFIG_REGISTRY: "https://private-registry.example",
      HOME: "/private/home", HTTPS_PROXY: "https://private-proxy.example",
    });
    const before = { ...sourceEnv };
    const plan = ready({ sourceEnv });
    expect(plan.env).toEqual({
      ...ready().env,
      PATH: "/fixture/bin", TMPDIR: "/fixture/tmp", TMP: "/fixture/tmp2", TEMP: "/fixture/tmp3",
      SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows",
    });
    expect(sourceEnv).toEqual(before);
    expect(plan.env).not.toBe(sourceEnv);
    expect(ready({ sourceEnv }).env).not.toBe(plan.env);
  });

  it("does not coerce absent or non-string platform values", () => {
    const plan = ready({ sourceEnv: { PATH: undefined, TMPDIR: null, TEMP: 123, WINDIR: false } });
    expect(plan.env).toEqual(ready().env);
  });

  it("declares every generated application or tooling key in the environment example", () => {
    const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
    const declared = new Set([...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(match => match[1]));
    // CI and locale are ambient runner settings, never application bindings.
    const ambient = /^(CI|TZ|LANG|LC_ALL)$/;
    for (const key of Object.keys(ready().env).filter(key => !ambient.test(key))) {
      expect(declared.has(key), `${key} must be declared`).toBe(true);
    }
    expect(example).toMatch(/^E2E_DATABASE_URL=$/m);
    expect(example).toMatch(/^E2E_PORT=3100$/m);
  });
});
