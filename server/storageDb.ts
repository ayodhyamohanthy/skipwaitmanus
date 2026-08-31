import { Buffer } from "node:buffer";
import { drizzle } from "drizzle-orm/mysql2";
import * as mysql from "mysql2/promise";
import { documentBlobs } from "../drizzle/schema";

/**
 * Database-backed storage adapter — the zero-config fallback for document
 * attachments when no object store (R2 / managed Forge) is configured.
 * Bytes live in `documentBlobs` keyed by the same fileKey the rest of the
 * storage contract uses, so switching to R2 later changes only the adapter
 * selection in _core/index.ts, not the call sites.
 */

let pool: mysql.Pool | undefined;

function getPool() {
  if (!pool) {
    const url = new URL(process.env.DATABASE_URL ?? "");
    pool = mysql.createPool({
      uri: process.env.DATABASE_URL ?? "",
      host: url.hostname,
      user: decodeURIComponent(url.username || "root"),
      password: decodeURIComponent(url.password || url.searchParams.get("password") || ""),
      database: url.pathname.slice(1),
      port: Number(url.port || 3306),
      connectionLimit: 5,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

const db = () => drizzle(getPool());

export async function dbStoragePut(key: string, data: Buffer): Promise<{ key: string }> {
  const d = db();
  await d.insert(documentBlobs).values({ fileKey: key, data, sizeBytes: data.length }).onDuplicateKeyUpdate({ set: { data, sizeBytes: data.length } });
  return { key };
}

export async function dbStorageGet(key: string): Promise<{ data: Buffer } | undefined> {
  const d = db();
  const rows = await d.select().from(documentBlobs).where(eq(documentBlobs.fileKey, key)).limit(1);
  const row = rows[0];
  return row ? { data: Buffer.from(row.data) } : undefined;
}

import { eq } from "drizzle-orm";
