import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

// Azure Database for MySQL enforces TLS; drizzle-kit does not honor ssl
// query params in the URL, so parse the URI and pass ssl explicitly.
const parsed = new URL(connectionString);

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: parsed.username,
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, "") || undefined,
    ssl: { rejectUnauthorized: false },
  },
});
