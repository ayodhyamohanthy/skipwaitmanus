/**
 * TLS options for the MySQL connections.
 *
 * `rejectUnauthorized: false` disables certificate validation, so a
 * network-positioned attacker (or a hostile DNS/proxy path) could MITM the
 * database connection and read credentials and stored document bytes. It has been
 * the default only because Azure Database for MySQL enforces TLS and its CA is not
 * in Node's trust store — validating without the CA would break the connection.
 *
 * Set `DATABASE_SSL_CA` to the provider's CA bundle and validation turns on. The
 * value may contain real newlines or `\n` escapes (env files usually need the
 * latter). This is the recommended configuration; Azure's documented path is to
 * download the CA and pass it as `ca`.
 *
 * Both `server/db.ts` and `server/storageDb.ts` use this so the two connections
 * cannot drift apart.
 */
export function databaseSslOptions(
  env: NodeJS.ProcessEnv = process.env
): { ca?: string; rejectUnauthorized: boolean } {
  const ca = env.DATABASE_SSL_CA?.replace(/\\n/g, "\n").trim();
  if (ca) return { ca, rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

/**
 * Parsed connection settings for a `DATABASE_URL`, or a clear error.
 *
 * `new URL(process.env.DATABASE_URL ?? "")` threw a bare `TypeError: Invalid URL`,
 * which surfaced as an unhandled storage failure rather than "the database is not
 * configured" — and the DB-backed storage adapter is the default whenever no
 * object store is set, so it is reached on a no-database deployment.
 */
export function databaseUrlParts(
  env: NodeJS.ProcessEnv = process.env
): { raw: string; host: string; user: string; password: string; database: string; port: number } {
  const raw = env.DATABASE_URL?.trim();
  if (!raw) throw new Error("DATABASE_URL is not configured; database-backed storage is unavailable");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a valid connection URL; database-backed storage is unavailable");
  }
  return {
    raw,
    host: url.hostname,
    user: decodeURIComponent(url.username || "root"),
    password: decodeURIComponent(url.password || url.searchParams.get("password") || ""),
    database: url.pathname.slice(1),
    port: Number(url.port || 3306),
  };
}
