// Async personal-data export (queue task 4a). The hourly "data-export-sweep" job builds the ZIP from
// the same fields the existing JSON export already returns (the user's own data only), keeps it as a
// size-capped blob for 7 days, then drops the blob. No email, no notification, no credit or ask change.
import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import { dataExports } from "../drizzle/schema";
import { getDb } from "./db";
import { exportUserData } from "./db";
import { JobRunStoreUnavailableError } from "./jobRunStore";
import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";

export const EXPORT_MAX_BYTES = 10 * 1024 * 1024;
export const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const EXPORT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const EXPORT_SWEEP_BATCH = 5;

/** One JSON file per top-level section, plus a short README. Throws RangeError when over the cap. */
export function buildExportZip(data: Record<string, unknown>): Buffer {
  const files: Record<string, Uint8Array> = {};
  const sections: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === "generatedAt" || key === "format") continue;
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) continue;
    files[`${key}.json`] = strToU8(JSON.stringify(value ?? null, null, 2));
    sections.push(`${key}.json`);
  }
  files["README.txt"] = strToU8([
    "Your skipwait.me personal data export.",
    `Generated: ${typeof data.generatedAt === "string" ? data.generatedAt : new Date().toISOString()}`,
    `Format: ${typeof data.format === "string" ? data.format : "skipwait.me-personal-data-export"}`,
    "",
    "Each file is one section of the data we keep for you, as JSON:",
    ...sections.map(name => `- ${name}`),
    "",
  ].join("\n"));
  const zip = Buffer.from(zipSync(files, { level: 6 }));
  if (zip.byteLength > EXPORT_MAX_BYTES) throw new RangeError("Export is larger than the size limit");
  return zip;
}

export type ExportStatus = "requested" | "ready" | "failed" | "expired";
export type ExportSummary = { id: number; status: ExportStatus; requestedAt: Date; readyAt: Date | null; expiresAt: Date | null; byteSize: number; fileName: string | null };
export type RequestExportResult =
  | { kind: "created"; id: number }
  | { kind: "active"; id: number }
  | { kind: "cooldown"; id: number; retryAfterSeconds: number };

const summaryColumns = { id: dataExports.id, status: dataExports.status, requestedAt: dataExports.requestedAt, readyAt: dataExports.readyAt, expiresAt: dataExports.expiresAt, byteSize: dataExports.byteSize, fileName: dataExports.fileName };

export async function requestDataExport(userId: number, nowMs: number = Date.now()): Promise<RequestExportResult> {
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const [active] = await db.select({ id: dataExports.id }).from(dataExports).where(and(eq(dataExports.userId, userId), eq(dataExports.activeKey, `export:${userId}`))).limit(1);
  if (active) return { kind: "active", id: active.id };
  // One export per 24 hours. A failed attempt does not count, so a retry is possible.
  const [recent] = await db.select({ id: dataExports.id, requestedAt: dataExports.requestedAt }).from(dataExports)
    .where(and(eq(dataExports.userId, userId), inArray(dataExports.status, ["requested", "ready", "expired"]), gt(dataExports.requestedAt, new Date(nowMs - EXPORT_COOLDOWN_MS))))
    .orderBy(desc(dataExports.requestedAt)).limit(1);
  if (recent) return { kind: "cooldown", id: recent.id, retryAfterSeconds: Math.max(1, Math.ceil((recent.requestedAt.getTime() + EXPORT_COOLDOWN_MS - nowMs) / 1000)) };
  try {
    const result = await db.insert(dataExports).values({ userId, status: "requested", activeKey: `export:${userId}`, requestedAt: new Date(nowMs) });
    return { kind: "created", id: Number(result[0].insertId) };
  } catch {
    const [concurrent] = await db.select({ id: dataExports.id }).from(dataExports).where(eq(dataExports.activeKey, `export:${userId}`)).limit(1);
    if (concurrent) return { kind: "active", id: concurrent.id };
    throw new Error("We could not create your export request");
  }
}

export async function getLatestDataExport(userId: number): Promise<ExportSummary | null> {
  const db = await getDb(); if (!db) return null;
  const [row] = await db.select(summaryColumns).from(dataExports).where(eq(dataExports.userId, userId)).orderBy(desc(dataExports.requestedAt), desc(dataExports.id)).limit(1);
  return row ? { ...row, status: row.status as ExportStatus } : null;
}

/** The owner's ready, unexpired file, or null. */
export async function getDataExportFile(userId: number, id: number, nowMs: number = Date.now()): Promise<{ data: Buffer; fileName: string } | null> {
  const db = await getDb(); if (!db) return null;
  const [row] = await db.select({ zipData: dataExports.zipData, fileName: dataExports.fileName, expiresAt: dataExports.expiresAt }).from(dataExports)
    .where(and(eq(dataExports.id, id), eq(dataExports.userId, userId), eq(dataExports.status, "ready"))).limit(1);
  if (!row?.zipData || !row.expiresAt || row.expiresAt.getTime() <= nowMs) return null;
  return { data: Buffer.from(row.zipData), fileName: row.fileName || "skipwait-personal-data.zip" };
}

export type DataExportSweepDeps = {
  listRequested: (limit: number) => Promise<Array<{ id: number; userId: number }>>;
  build: (userId: number) => Promise<Buffer>;
  markReady: (id: number, zip: Buffer, fileName: string, nowMs: number) => Promise<void>;
  markFailed: (id: number, note: string) => Promise<void>;
  expireOld: (nowMs: number) => Promise<number>;
};

export const liveDataExportSweepDeps: DataExportSweepDeps = {
  async listRequested(limit) {
    const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
    return db.select({ id: dataExports.id, userId: dataExports.userId }).from(dataExports).where(eq(dataExports.status, "requested")).orderBy(dataExports.requestedAt).limit(limit);
  },
  async build(userId) { return buildExportZip(await exportUserData(userId) as Record<string, unknown>); },
  async markReady(id, zip, fileName, nowMs) {
    const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
    await db.update(dataExports).set({ status: "ready", activeKey: null, zipData: zip, byteSize: zip.byteLength, fileName, readyAt: new Date(nowMs), expiresAt: new Date(nowMs + EXPORT_TTL_MS), failureNote: null }).where(and(eq(dataExports.id, id), eq(dataExports.status, "requested")));
  },
  async markFailed(id, note) {
    const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
    await db.update(dataExports).set({ status: "failed", activeKey: null, failureNote: note.slice(0, 200) }).where(and(eq(dataExports.id, id), eq(dataExports.status, "requested")));
  },
  async expireOld(nowMs) {
    const db = await getDb(); if (!db) throw new JobRunStoreUnavailableError();
    const result = await db.update(dataExports).set({ status: "expired", zipData: null }).where(and(eq(dataExports.status, "ready"), lt(dataExports.expiresAt, new Date(nowMs))));
    // A request that kept failing for two days stops retrying; the user can ask again.
    await db.update(dataExports).set({ status: "failed", activeKey: null, failureNote: "We could not prepare this export. Please request it again." }).where(and(eq(dataExports.status, "requested"), lt(dataExports.requestedAt, new Date(nowMs - 2 * 24 * 60 * 60 * 1000))));
    return Number(result[0].affectedRows ?? 0);
  },
};

export function createDataExportSweep(deps: DataExportSweepDeps = liveDataExportSweepDeps) {
  return async ({ nowMs }: JobRunContext): Promise<JobRunOutput> => {
    const output: JobRunOutput = { processed: 0, failed: 0 };
    try { await deps.expireOld(nowMs); } catch (error) { output.failed += 1; output.firstError = error; }
    const pending = await deps.listRequested(EXPORT_SWEEP_BATCH);
    for (const item of pending) {
      try {
        const zip = await deps.build(item.userId);
        const day = new Date(nowMs).toISOString().slice(0, 10);
        await deps.markReady(item.id, zip, `skipwait-personal-data-${day}.zip`, nowMs);
        output.processed += 1;
      } catch (error) {
        if (error instanceof RangeError) {
          try { await deps.markFailed(item.id, "Your export is larger than the size limit. Contact support and we will prepare it another way."); } catch { /* retried next hour */ }
        }
        // Any other failure leaves the request pending, so the next hourly run retries it.
        output.failed += 1; if (output.firstError === undefined) output.firstError = error;
      }
    }
    return output;
  };
}
