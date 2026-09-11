import { createHash, randomInt } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { workEmailOtpCodes } from "../drizzle/schema";
import { getDb, isWorkEmailDomain } from "./db";
import { sendTransactionalEmail } from "./emailDelivery";

export type WorkEmailOtpDeliveryInput = { to: string; code: string };

export type WorkEmailOtpSendResult = { sent: boolean; reason: "sent" | "not_configured" | "delivery_failed" | "rate_limited" | "invalid_email" };

export type WorkEmailOtpDependencies = {
  sendEmail?: (input: WorkEmailOtpDeliveryInput) => Promise<{ sent: boolean; reason: string }>;
  now?: () => number;
};

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_ACTIVE_PER_EMAIL = 3;
// How long a consumed code keeps counting as proof that this address was
// verified. Short enough that a code cannot be reused across sessions, long
// enough to cover the enroll call that immediately follows verification.
const VERIFICATION_RECEIPT_MS = 10 * 60 * 1000;

export function isValidWorkEmailOtpEmail(value: string): boolean {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) || value.length > 320) return false;
  const domain = value.slice(value.lastIndexOf("@") + 1).toLowerCase();
  // Referrer-plane login is work-email-only: consumer inboxes never receive codes.
  return isWorkEmailDomain(domain);
}

export function hashCode(email: string, code: string): string {
  return createHash("sha256").update(`${email.toLowerCase()}:${code}`).digest("hex");
}

function otpEmailText(code: string) {
  return [
    "Your skipwait.me work-email verification code",
    "",
    `Code: ${code}`,
    "",
    "This code expires in 10 minutes and can be used once.",
    "skipwait.me will never ask for this code by phone or chat.",
    "If you did not request it, ignore this email — nothing changes.",
  ].join("\n");
}

export function createWorkEmailOtpService(dependencies: WorkEmailOtpDependencies = {}) {
  const now = dependencies.now ?? (() => Date.now());
  const sendEmail = dependencies.sendEmail;
  return {
    async sendCode(rawEmail: string): Promise<WorkEmailOtpSendResult> {
      const email = rawEmail.trim().toLowerCase();
      if (!isValidWorkEmailOtpEmail(email)) return { sent: false, reason: "invalid_email" };
      const db = await getDb();
      if (!db) return { sent: false, reason: "not_configured" };
      const existing = await db.select().from(workEmailOtpCodes).where(eq(workEmailOtpCodes.email, email));
      const active = existing.filter(row => row.expiresAt.getTime() > now() && row.consumedAt === null);
      if (active.some(row => row.createdAt.getTime() > now() - RESEND_COOLDOWN_MS)) return { sent: false, reason: "rate_limited" };
      if (active.length >= MAX_ACTIVE_PER_EMAIL) return { sent: false, reason: "rate_limited" };
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await db.insert(workEmailOtpCodes).values({ email, codeHash: hashCode(email, code), expiresAt: new Date(now() + CODE_TTL_MS), attempts: 0, createdAt: new Date(now()) });
      if (!sendEmail) return { sent: false, reason: "not_configured" };
      const delivery = await sendEmail({ to: email, code });
      return delivery.sent ? { sent: true, reason: "sent" } : { sent: false, reason: delivery.reason === "not_configured" ? "not_configured" : "delivery_failed" };
    },
    async verifyCode(rawEmail: string, rawCode: string, options: { verifiedByUserId?: number } = {}): Promise<boolean> {
      const email = rawEmail.trim().toLowerCase();
      const code = rawCode.trim();
      if (!isValidWorkEmailOtpEmail(email) || !/^\d{6}$/.test(code)) return false;
      const db = await getDb();
      if (!db) return false;
      const rows = await db.select().from(workEmailOtpCodes).where(and(eq(workEmailOtpCodes.email, email), eq(workEmailOtpCodes.codeHash, hashCode(email, code))));
      const row = rows[0];
      if (!row) return false;
      if (row.consumedAt !== null || row.expiresAt.getTime() <= now()) return false;
      if (row.attempts >= MAX_ATTEMPTS) return false;
      // Record WHO consumed the code alongside when. The receipt below is only
      // meaningful if it can be attributed to a specific account.
      await db.update(workEmailOtpCodes).set({ consumedAt: new Date(now()), verifiedByUserId: options.verifiedByUserId ?? null }).where(eq(workEmailOtpCodes.id, row.id));
      return true;
    },
    async registerFailedAttempt(rawEmail: string, rawCode: string): Promise<void> {
      const email = rawEmail.trim().toLowerCase();
      const code = rawCode.trim();
      if (!isValidWorkEmailOtpEmail(email) || !/^\d{6}$/.test(code)) return;
      const db = await getDb();
      if (!db) return;
      const rows = await db.select().from(workEmailOtpCodes).where(eq(workEmailOtpCodes.email, email));
      // Charge the failure against every code still in play for this address.
      // Matching on the submitted code's hash would only ever penalise a
      // *correct* code — a wrong guess matches no row, so the counter stayed at
      // zero and MAX_ATTEMPTS never locked anything out.
      const timestamp = now();
      const active = rows.filter(row => row.consumedAt === null && row.expiresAt.getTime() > timestamp);
      for (const row of active) {
        await db.update(workEmailOtpCodes).set({ attempts: row.attempts + 1 }).where(eq(workEmailOtpCodes.id, row.id));
      }
    },
    /**
     * Server-owned proof that *this account* completed the OTP flow for an
     * address.
     *
     * Enrollment must never trust a client-supplied "I verified this" flag: the
     * browser can send anything. `consumedAt` is written only by `verifyCode`
     * after a correct, unexpired, un-exhausted code, so a recent timestamp is
     * genuine evidence the code was received and entered.
     *
     * `userId` is required and matched against `verifiedByUserId`, because the
     * address alone is not proof of anything: the referrer OTP login flow
     * consumes a code for the same address, so a receipt keyed only on the email
     * would let any signed-in account that merely *knows* a colleague's work
     * address enroll as a verified employee of that company.
     */
    async hasRecentVerification(rawEmail: string, options: { userId: number; withinMs?: number }): Promise<boolean> {
      const { userId, withinMs = VERIFICATION_RECEIPT_MS } = options;
      if (!Number.isInteger(userId) || userId <= 0) return false;
      const email = rawEmail.trim().toLowerCase();
      if (!isValidWorkEmailOtpEmail(email)) return false;
      const db = await getDb();
      if (!db) return false;
      const rows = await db.select().from(workEmailOtpCodes).where(eq(workEmailOtpCodes.email, email));
      const timestamp = now();
      return rows.some(row => row.consumedAt !== null && row.verifiedByUserId === userId && row.consumedAt.getTime() > timestamp - withinMs);
    },
  };
}

// Shared wired instance: delivers codes via the transactional sender
// (ZeptoMail primary, Resend fallback). index.ts and the OTP login routes
// both use this instance so delivery is configured exactly once.
export const workEmailOtpService = createWorkEmailOtpService({
  sendEmail: async ({ to, code }) => sendTransactionalEmail({
    to,
    subject: "Your skipwait.me verification code",
    text: `Your skipwait.me verification code is ${code}. It expires in 10 minutes and works once.\n\nIf you did not request it, ignore this email — nothing changes.`,
  }),
});
