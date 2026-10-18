import type { DurableLimitStore, DurableLimitTx } from "./durableRateLimit";

/**
 * Deterministic in-memory DurableLimitStore for tests: serialised
 * transactions (like the row locks MySQL takes) that commit only when the work
 * resolves, so a full bucket rolls back every increment made before it.
 * Never used at runtime: production always passes through MySQL.
 */
export type MemoryDurableLimitStore = DurableLimitStore & { readonly rows: ReadonlyMap<string, { hitCount: number; expiresAt: number }> };

export function createMemoryDurableLimitStore(): MemoryDurableLimitStore {
  let committed = new Map<string, { hitCount: number; expiresAt: number }>();
  let queue: Promise<unknown> = Promise.resolve();
  const id = (key: string, windowStart: Date) => `${key}|${windowStart.getTime()}`;
  return {
    get rows() { return committed; },
    transaction<T>(work: (tx: DurableLimitTx) => Promise<T>): Promise<T> {
      const run = queue.then(async () => {
        const draft = new Map<string, { hitCount: number; expiresAt: number }>();
        committed.forEach((row, key) => draft.set(key, { ...row }));
        const tx: DurableLimitTx = {
          async pruneExpired(now) { Array.from(draft.keys()).forEach(key => { if ((draft.get(key)?.expiresAt ?? 0) < now.getTime()) draft.delete(key); }); },
          async insertWindow(key, windowStart, expiresAt) {
            if (draft.has(id(key, windowStart))) return false;
            draft.set(id(key, windowStart), { hitCount: 1, expiresAt: expiresAt.getTime() });
            return true;
          },
          async incrementBelow(key, windowStart, limit) {
            const row = draft.get(id(key, windowStart));
            if (!row || row.hitCount >= limit) return false;
            row.hitCount += 1;
            return true;
          },
          async exists(key, windowStart, now) {
            const row = draft.get(id(key, windowStart));
            return Boolean(row && row.expiresAt > now.getTime());
          },
          async remove(key, windowStart) { draft.delete(id(key, windowStart)); },
          async countHit(key, windowStart, expiresAt) {
            const row = draft.get(id(key, windowStart));
            if (row) { row.hitCount += 1; return row.hitCount; }
            draft.set(id(key, windowStart), { hitCount: 1, expiresAt: expiresAt.getTime() });
            return 1;
          },
          async latestExpiry(keys, now) {
            const wanted = new Set(keys);
            let latest: number | null = null;
            draft.forEach((row, rowId) => {
              const key = rowId.slice(0, rowId.lastIndexOf("|"));
              if (wanted.has(key) && row.expiresAt > now.getTime() && (latest === null || row.expiresAt > latest)) latest = row.expiresAt;
            });
            return latest === null ? null : new Date(latest);
          },
        };
        const result = await work(tx);
        committed = draft;
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
