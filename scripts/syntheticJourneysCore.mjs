// REL-synthetic-journeys: dormant local preparation only; importing this never runs a journey.
import { z } from "zod";

const OPTIONS_ERROR = "Invalid local synthetic journey options.";
const DATABASE_ERROR = "Local synthetic journeys require a loopback QA MySQL URL.";
const platformString = z.preprocess(value => typeof value === "string" ? value : undefined, z.string().optional());
const optionsSchema = z.object({
  enabled: z.boolean().default(false),
  databaseUrl: z.string().optional(),
  port: z.number().int().min(1024).max(65535).default(3100),
  sourceEnv: z.object({
    PATH: platformString,
    TMPDIR: platformString,
    TMP: platformString,
    TEMP: platformString,
    SystemRoot: platformString,
    WINDIR: platformString,
  }).strip().default({}),
}).strict();

function isLocalQaDatabase(value) {
  if (!value.startsWith("mysql://") || /[\s\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    // Check the raw authority/path too: URL parsing can normalize dot segments.
    const authority = value.slice(8).split("/")[0];
    const host = authority.slice(authority.lastIndexOf("@") + 1);
    const name = /^\/([A-Za-z0-9_]{1,64})$/.exec(value.slice(8 + authority.length))?.[1];
    if (!/^(localhost|127\.0\.0\.1)(?::[0-9]+)?$/.test(host)) return false;
    if (url.protocol !== "mysql:" || !["localhost", "127.0.0.1"].includes(url.hostname)) return false;
    if (url.port && (Number(url.port) < 1 || Number(url.port) > 65535)) return false;
    if (url.search || url.hash || !name?.split("_").includes("qa")) return false;
    // Malformed credential escapes must fail before a future launcher decodes them.
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
    return true;
  } catch {
    return false;
  }
}

const databaseSchema = z.string().refine(isLocalQaDatabase);

/** Calculate a future runner plan; no environment reads, execution or activation hook. */
export function planLocalSyntheticJourneys(options = {}) {
  const parsed = optionsSchema.safeParse(options);
  if (!parsed.success) throw new Error(OPTIONS_ERROR);
  const { enabled, databaseUrl, port, sourceEnv } = parsed.data;
  if (!enabled) return { enabled: false };
  const database = databaseSchema.safeParse(databaseUrl);
  if (!database.success) throw new Error(DATABASE_ERROR);

  const platformEnv = Object.fromEntries(Object.entries(sourceEnv).filter(([, value]) => typeof value === "string"));
  return {
    enabled: true,
    baseURL: `http://127.0.0.1:${port}`,
    command: ["pnpm", "e2e"],
    env: {
      ...platformEnv,
      CI: "true",
      NODE_ENV: "test",
      TZ: "UTC",
      LANG: "en_US.UTF-8",
      LC_ALL: "en_US.UTF-8",
      E2E_PORT: String(port),
      PORT: String(port),
      E2E_DATABASE_URL: database.data,
      DATABASE_URL: database.data,
      VITE_APP_ID: "skipwait",
      BILLING_ENV: "test",
      CHARGEBEE_SITE: "e2e-placeholder",
      CHARGEBEE_API_KEY: "e2e-placeholder",
      CHARGEBEE_WEBHOOK_SECRET: "e2e-placeholder",
    },
  };
}
