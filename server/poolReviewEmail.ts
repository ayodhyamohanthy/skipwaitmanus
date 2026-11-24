import type { JobRunContext, JobRunOutput } from "./scheduledJobRunner";
export class PoolReviewEmailOriginMissingError extends Error {}
export function createPoolReviewEmail(_overrides: Record<string, unknown> = {}) {
  return async (_context: JobRunContext): Promise<JobRunOutput> => ({ processed: 0, failed: 0 });
}
