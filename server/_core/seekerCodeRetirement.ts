import type { RequestHandler } from "express";
import { timingSafeEqual, createHmac } from "node:crypto";
import { z } from "zod";
import { SEEKER_CODE_GRACE_MS, SEEKER_PASSWORD_RELEASE_HEADER } from "../../shared/seekerPasswordRelease";
import { createMysqlJobRunStore, type JobRunClaim, type JobRunStore } from "../jobRunStore";
import { captureServerError } from "../sentry";

const JOB = "seeker-password-release";
const WINDOW = "first-canonical-activation";
const receiptSchema = z.object({ startedAt: z.date(), leaseOwner: z.string().regex(/^[a-f0-9]{40}$/), error: z.string().regex(/^activation-ms:\d{13}$/) });
type ReceiptStore = Pick<JobRunStore, "find"> & { insertRunning: (claim: JobRunClaim & { error: string }) => Promise<"inserted" | "duplicate"> };

/** One permanent run receipt, never a renewable lease. Its unique job/window
 * key serializes first activation across instances; no takeover or expiry
 * cleanup is used, so a restart, redeploy or rollback cannot extend the grace. */
export function createSeekerCodeRetirement(store: ReceiptStore = createMysqlJobRunStore()) {
  return {
    async activate(sha: string, at: number): Promise<void> {
      if (!/^[a-f0-9]{40}$/.test(sha) || !Number.isSafeInteger(at) || at <= 0) throw new Error("Invalid password release receipt");
      const startedAt = new Date(Math.floor(at / 1000) * 1000);
      await store.insertRunning({ jobName: JOB, windowKey: WINDOW, leaseOwner: sha, startedAt, leaseExpiresAt: new Date(startedAt.getTime() + SEEKER_CODE_GRACE_MS), error: `activation-ms:${at}` });
    },
    async cutoff(): Promise<number | null> {
      const row = await store.find(JOB, WINDOW);
      if (!row) return null;
      const receipt = receiptSchema.parse(row);
      return receipt.startedAt.getTime() + SEEKER_CODE_GRACE_MS;
    },
  };
}

export const seekerCodeRetirement = createSeekerCodeRetirement();

export function verifiedActivationTime(header: string | undefined, secret: string, expectedSha: string, now: number): number | null {
  if (!header || !secret || !/^[a-f0-9]{40}$/.test(expectedSha)) return null;
  const parts = /^([a-f0-9]{40})\.(\d{13})\.([a-f0-9]{64})$/.exec(header);
  if (!parts || parts[1] !== expectedSha) return null;
  const at = Number(parts[2]);
  if (!Number.isSafeInteger(at) || Math.abs(now - at) > 60_000) return null;
  const expected = createHmac("sha256", secret).update(`seeker-password-release:${expectedSha}:${at}`).digest();
  return timingSafeEqual(Buffer.from(parts[3], "hex"), expected) ? at : null;
}

export function seekerPasswordActivationMiddleware(input: {
  readonly isReady: () => boolean;
  readonly sha: () => Promise<string>;
  readonly secret: () => string;
  readonly now?: () => number;
  readonly retirement?: ReturnType<typeof createSeekerCodeRetirement>;
}): RequestHandler {
  const retirement = input.retirement ?? seekerCodeRetirement;
  let recorded = false;
  return (req, res, next) => {
    if (recorded || !input.isReady() || !req.header(SEEKER_PASSWORD_RELEASE_HEADER)) return next();
    void (async () => {
      const sha = await input.sha();
      const at = verifiedActivationTime(req.header(SEEKER_PASSWORD_RELEASE_HEADER), input.secret(), sha, (input.now ?? Date.now)());
      if (at === null) return next();
      await retirement.activate(sha, at);
      recorded = true;
      next();
    })().catch(error => {
      captureServerError(error, { operation: "seeker_password_release" });
      res.status(503).set("Cache-Control", "no-store").json({ error: "Sign-in is temporarily unavailable. Try again shortly." });
    });
  };
}
