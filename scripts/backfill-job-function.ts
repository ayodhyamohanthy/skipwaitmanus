/**
 * One-off, reviewed backfill of jobs.jobFunction for rows created before
 * migration 0077. Dry-run by default: prints what it would write and changes
 * nothing. Re-runs are no-ops: only rows whose jobFunctionSource is NULL are
 * read or written (see server/jobFunctionBackfill.ts).
 *
 * Usage (owner, against the target database):
 *   DATABASE_URL='mysql://…' pnpm tsx scripts/backfill-job-function.ts            # dry run
 *   DATABASE_URL='mysql://…' pnpm tsx scripts/backfill-job-function.ts --apply    # write
 *   Options: --batch <1-2000> (default 500), --max <rows> (default 100000)
 */
import { getDb } from "../server/db";
import { drizzleBackfillStore, runJobFunctionBackfill } from "../server/jobFunctionBackfill";

export function parseBackfillArgs(argv: readonly string[]): { apply: boolean; batchSize: number; maxRows: number } {
  const options = { apply: false, batchSize: 500, maxRows: 100_000 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") { options.apply = true; continue; }
    if (arg === "--batch" || arg === "--max") {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 1) throw new Error(`${arg} needs a positive whole number`);
      if (arg === "--batch") options.batchSize = Math.min(value, 2000); else options.maxRows = value;
      i++;
      continue;
    }
    throw new Error(`Unknown option ${arg}. Use --apply, --batch <n>, --max <n>.`);
  }
  return options;
}

async function main() {
  const options = parseBackfillArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const db = await getDb();
  if (!db) throw new Error("Could not connect to the database");
  const report = await runJobFunctionBackfill(drizzleBackfillStore(db), options);
  console.log(JSON.stringify(report, null, 2));
  if (report.mode === "dry-run") console.log("Dry run: nothing was written. Re-run with --apply to write.");
  process.exit(0);
}

if (process.argv[1]?.endsWith("backfill-job-function.ts")) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
