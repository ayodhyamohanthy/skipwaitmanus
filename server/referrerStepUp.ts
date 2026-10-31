// D-057-session-gate (D-245, packet docs/plans/D-057-session-gate.md §0b.3):
// the server-side step-up proof. One referrerStepUps row per challenge; a
// challenge becomes a proof once its code is accepted. A proof is fresh only
// for the account and the session that made it, for the exact work email of
// record, and only while the account's own revocation, suspension and
// employer state still allow it. Nothing here identifies, links or merges
// accounts: every read is scoped to one authenticated account id.
import { createHash } from "node:crypto";
import { and, desc, eq, gt, gte, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { referralRequests, referrerStepUps } from "../drizzle/schema";
import { REFERRER_STEP_UP_PURPOSE, type ReferrerStepUpPurpose } from "../shared/referrerStepUp";
import * as db from "./db";
import { isVerifiedEmployeeOfCompany } from "./referrerAvailability";
import { captureServerError } from "./sentry";

export type StepUpRevokedReason = "superseded" | "logout";
export type StepUpRecord = {
  id: number;
  challengeIdHash: string;
  userId: number;
  sessionKeyHash: string;
  purpose: ReferrerStepUpPurpose;
  emailFingerprint: string;
  workEmailDomain: string;
  codeHash: string;
  codeExpiresAt: Date;
  attempts: number;
  verifiedAt: Date | null;
  proofExpiresAt: Date | null;
  revokedAt: Date | null;
  revokedReason: StepUpRevokedReason | null;
  createdAt: Date;
};
export type NewStepUpChallenge = Pick<StepUpRecord, "challengeIdHash" | "userId" | "sessionKeyHash" | "emailFingerprint" | "workEmailDomain" | "codeHash" | "codeExpiresAt" | "createdAt">;

/** Persistence for step-ups. Every method is scoped to the ids it is handed. */
export interface ReferrerStepUpStore {
  insertChallenge(row: NewStepUpChallenge): Promise<void>;
  /** A new send supersedes the session's pending (unverified, unrevoked) challenge. */
  supersedePending(userId: number, sessionKeyHash: string, now: Date): Promise<void>;
  findByChallengeIdHash(challengeIdHash: string): Promise<StepUpRecord | undefined>;
  /** Counts one wrong code, never past the limit. */
  recordWrongAttempt(id: number, maxAttempts: number): Promise<void>;
  /** The single-use consume: one conditional update; true only when exactly this call made the proof. */
  consume(id: number, now: Date, proofExpiresAt: Date, maxAttempts: number): Promise<boolean>;
  /** A new proof supersedes the session's earlier proofs, so one live proof remains. */
  supersedeProofs(userId: number, sessionKeyHash: string, exceptId: number, now: Date): Promise<void>;
  /** The newest verified, unrevoked proof for this account, session and purpose. */
  latestProof(userId: number, sessionKeyHash: string): Promise<StepUpRecord | undefined>;
  /** The address of record: the fingerprint of the account's newest verified proof at this domain since the enrolment. */
  addressOfRecord(userId: number, workEmailDomain: string, notBefore: Date | null): Promise<string | null>;
  /** Logout: marks the account's live rows revoked, best effort (the freshness check already ends them). */
  revokeForUser(userId: number, reason: "logout", now: Date): Promise<void>;
  /** Whether this account is the referrer on this ask (the progress route is gated only for the referrer). */
  isReferrerOfRequest(userId: number, requestId: number): Promise<boolean>;
}

export const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

/**
 * The stored code digest. The packet names `<challengeId>:<email>:<code>`; the
 * verify request carries only the challenge id and the code, and the row keeps
 * the address only as its fingerprint, so the digest binds that fingerprint
 * (an HMAC of the exact normalized address) in the email's place.
 */
export const stepUpCodeHash = (challengeId: string, emailFingerprint: string, code: string): string => sha256Hex(`${challengeId}:${emailFingerprint}:${code}`);

export type StepUpAccount = { id: number; suspended?: boolean | null; sessionsValidAfter?: Date | null };
export type StepUpProfile = { accountType?: string | null; workEmailDomain?: string | null; workEmailVerifiedAt?: Date | null } | undefined;

/**
 * Whether a proof still opens referrer actions for this request (§0b.3). Every
 * check reads the app clock, never MySQL NOW(), at one-second granularity for
 * the revocation stamp exactly as sdk.verifySession does.
 */
export function isFreshStepUpProof(proof: StepUpRecord | undefined, context: { userId: number; sessionKeyHash: string; account: StepUpAccount | undefined; profile: StepUpProfile; now: number }): boolean {
  if (!proof || !proof.verifiedAt || !proof.proofExpiresAt || proof.revokedAt) return false;
  if (proof.purpose !== REFERRER_STEP_UP_PURPOSE) return false;
  if (proof.userId !== context.userId || proof.sessionKeyHash !== context.sessionKeyHash) return false;
  if (proof.proofExpiresAt.getTime() <= context.now) return false;
  const { account, profile } = context;
  if (!account || account.id !== context.userId || account.suspended) return false;
  const verifiedSecond = Math.floor(proof.verifiedAt.getTime() / 1000);
  if (account.sessionsValidAfter && Math.floor(account.sessionsValidAfter.getTime() / 1000) > verifiedSecond) return false;
  if (!profile?.workEmailDomain || profile.workEmailDomain !== proof.workEmailDomain) return false;
  if (!isVerifiedEmployeeOfCompany(profile, proof.workEmailDomain)) return false;
  if (profile.workEmailVerifiedAt && profile.workEmailVerifiedAt.getTime() > proof.verifiedAt.getTime()) return false;
  return true;
}

const live = (row: StepUpRecord) => row.revokedAt === null;

/** A process-local store with the same semantics as the MySQL one, for tests and local runs without a database. */
export function createMemoryStepUpStore(options: { referrerOf?: (userId: number, requestId: number) => boolean } = {}): ReferrerStepUpStore & { rows: () => StepUpRecord[] } {
  const rows: StepUpRecord[] = [];
  let nextId = 1;
  return {
    rows: () => rows.map(row => ({ ...row })),
    async insertChallenge(row) {
      if (rows.some(existing => existing.challengeIdHash === row.challengeIdHash)) throw new Error("STEP_UP_DUPLICATE_CHALLENGE");
      rows.push({ ...row, id: nextId++, purpose: REFERRER_STEP_UP_PURPOSE, attempts: 0, verifiedAt: null, proofExpiresAt: null, revokedAt: null, revokedReason: null });
    },
    async supersedePending(userId, sessionKeyHash, now) {
      for (const row of rows) if (row.userId === userId && row.sessionKeyHash === sessionKeyHash && row.verifiedAt === null && live(row)) Object.assign(row, { revokedAt: now, revokedReason: "superseded" });
    },
    async findByChallengeIdHash(challengeIdHash) { const row = rows.find(item => item.challengeIdHash === challengeIdHash); return row ? { ...row } : undefined; },
    async recordWrongAttempt(id, maxAttempts) { const row = rows.find(item => item.id === id); if (row && row.verifiedAt === null && row.attempts < maxAttempts) row.attempts += 1; },
    async consume(id, now, proofExpiresAt, maxAttempts) {
      const row = rows.find(item => item.id === id);
      if (!row || row.verifiedAt !== null || !live(row) || row.codeExpiresAt.getTime() <= now.getTime() || row.attempts >= maxAttempts) return false;
      Object.assign(row, { verifiedAt: now, proofExpiresAt });
      return true;
    },
    async supersedeProofs(userId, sessionKeyHash, exceptId, now) {
      for (const row of rows) if (row.id !== exceptId && row.userId === userId && row.sessionKeyHash === sessionKeyHash && row.verifiedAt !== null && live(row)) Object.assign(row, { revokedAt: now, revokedReason: "superseded" });
    },
    async latestProof(userId, sessionKeyHash) {
      const proofs = rows.filter(row => row.userId === userId && row.sessionKeyHash === sessionKeyHash && row.purpose === REFERRER_STEP_UP_PURPOSE && row.verifiedAt !== null && live(row));
      const newest = proofs.sort((a, b) => (b.verifiedAt?.getTime() ?? 0) - (a.verifiedAt?.getTime() ?? 0) || b.id - a.id)[0];
      return newest ? { ...newest } : undefined;
    },
    async addressOfRecord(userId, workEmailDomain, notBefore) {
      const proofs = rows.filter(row => row.userId === userId && row.workEmailDomain === workEmailDomain && row.verifiedAt !== null && (!notBefore || row.verifiedAt.getTime() >= notBefore.getTime()));
      return proofs.sort((a, b) => (b.verifiedAt?.getTime() ?? 0) - (a.verifiedAt?.getTime() ?? 0) || b.id - a.id)[0]?.emailFingerprint ?? null;
    },
    async revokeForUser(userId, reason, now) { for (const row of rows) if (row.userId === userId && live(row)) Object.assign(row, { revokedAt: now, revokedReason: reason }); },
    async isReferrerOfRequest(userId, requestId) { return options.referrerOf?.(userId, requestId) ?? false; },
  };
}

type Db = NonNullable<Awaited<ReturnType<typeof db.getDb>>>;
const affected = (result: unknown): number => Number((result as Array<{ affectedRows?: number }>)[0]?.affectedRows ?? 0);
const toRecord = (row: typeof referrerStepUps.$inferSelect): StepUpRecord => ({ ...row, revokedReason: row.revokedReason ?? null });

/** The MySQL store (drizzle/deploy/0116). Writes only referrerStepUps; reads referralRequests.referrerId for the progress route. */
export function createDrizzleStepUpStore(getDatabase: () => Promise<Db | null | undefined> = db.getDb): ReferrerStepUpStore {
  const required = async (): Promise<Db> => { const database = await getDatabase(); if (!database) throw new Error("STEP_UP_DATABASE_UNAVAILABLE"); return database; };
  return {
    async insertChallenge(row) { await (await required()).insert(referrerStepUps).values({ ...row, purpose: REFERRER_STEP_UP_PURPOSE, attempts: 0 }); },
    async supersedePending(userId, sessionKeyHash, now) {
      await (await required()).update(referrerStepUps).set({ revokedAt: now, revokedReason: "superseded" }).where(and(eq(referrerStepUps.userId, userId), eq(referrerStepUps.sessionKeyHash, sessionKeyHash), isNull(referrerStepUps.verifiedAt), isNull(referrerStepUps.revokedAt)));
    },
    async findByChallengeIdHash(challengeIdHash) {
      const [row] = await (await required()).select().from(referrerStepUps).where(eq(referrerStepUps.challengeIdHash, challengeIdHash)).limit(1);
      return row ? toRecord(row) : undefined;
    },
    async recordWrongAttempt(id, maxAttempts) {
      await (await required()).update(referrerStepUps).set({ attempts: sql`${referrerStepUps.attempts} + 1` }).where(and(eq(referrerStepUps.id, id), isNull(referrerStepUps.verifiedAt), lt(referrerStepUps.attempts, maxAttempts)));
    },
    async consume(id, now, proofExpiresAt, maxAttempts) {
      // Single use: one conditional update, one affected row (§0b.3). The app clock bounds the code's life.
      const result = await (await required()).update(referrerStepUps).set({ verifiedAt: now, proofExpiresAt }).where(and(eq(referrerStepUps.id, id), isNull(referrerStepUps.verifiedAt), isNull(referrerStepUps.revokedAt), gt(referrerStepUps.codeExpiresAt, now), lt(referrerStepUps.attempts, maxAttempts)));
      return affected(result) === 1;
    },
    async supersedeProofs(userId, sessionKeyHash, exceptId, now) {
      await (await required()).update(referrerStepUps).set({ revokedAt: now, revokedReason: "superseded" }).where(and(eq(referrerStepUps.userId, userId), eq(referrerStepUps.sessionKeyHash, sessionKeyHash), ne(referrerStepUps.id, exceptId), isNotNull(referrerStepUps.verifiedAt), isNull(referrerStepUps.revokedAt)));
    },
    async latestProof(userId, sessionKeyHash) {
      const database = await getDatabase(); if (!database) return undefined;
      const [row] = await database.select().from(referrerStepUps).where(and(eq(referrerStepUps.userId, userId), eq(referrerStepUps.sessionKeyHash, sessionKeyHash), eq(referrerStepUps.purpose, REFERRER_STEP_UP_PURPOSE), isNotNull(referrerStepUps.verifiedAt), isNull(referrerStepUps.revokedAt))).orderBy(desc(referrerStepUps.verifiedAt), desc(referrerStepUps.id)).limit(1);
      return row ? toRecord(row) : undefined;
    },
    async addressOfRecord(userId, workEmailDomain, notBefore) {
      const [row] = await (await required()).select({ emailFingerprint: referrerStepUps.emailFingerprint }).from(referrerStepUps).where(and(eq(referrerStepUps.userId, userId), eq(referrerStepUps.workEmailDomain, workEmailDomain), isNotNull(referrerStepUps.verifiedAt), ...(notBefore ? [gte(referrerStepUps.verifiedAt, notBefore)] : []))).orderBy(desc(referrerStepUps.verifiedAt), desc(referrerStepUps.id)).limit(1);
      return row?.emailFingerprint ?? null;
    },
    async revokeForUser(userId, reason, now) {
      await (await required()).update(referrerStepUps).set({ revokedAt: now, revokedReason: reason }).where(and(eq(referrerStepUps.userId, userId), isNull(referrerStepUps.revokedAt)));
    },
    async isReferrerOfRequest(userId, requestId) {
      const database = await getDatabase(); if (!database) return false;
      const [row] = await database.select({ referrerId: referralRequests.referrerId }).from(referralRequests).where(eq(referralRequests.id, requestId)).limit(1);
      return row?.referrerId === userId;
    },
  };
}

/**
 * Logout routes: mark the signed-out account's live step-ups `logout`, best
 * effort, for the audit trail. The proof is already dead through the account's
 * moved sessionsValidAfter; a failure here is reported, never thrown.
 */
export async function revokeReferrerStepUpsForSessionToken(token: string | undefined, store: ReferrerStepUpStore = createDrizzleStepUpStore()): Promise<void> {
  if (!token) return;
  try {
    const { sdk } = await import("./_core/sdk");
    const session = await sdk.verifySession(token);
    const account = session ? await db.getUserByOpenId(session.openId) : undefined;
    if (account) await store.revokeForUser(account.id, "logout", new Date());
  } catch (error) {
    captureServerError(error, { route: "logout", step: "referrer_step_up_revoke" });
  }
}

export const STEP_UP_PURPOSE = REFERRER_STEP_UP_PURPOSE;
