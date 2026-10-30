// D-057-session-gate (D-245, packet docs/plans/D-057-session-gate.md §0b.3):
// the server-side step-up proof. One referrerStepUps row per challenge; a
// challenge becomes a proof once its code is accepted. A proof is fresh only
// for the account and the session that made it, for the exact work email of
// record, and only while the account's own revocation, suspension and
// employer state still allow it. Nothing here identifies, links or merges
// accounts: every read is scoped to one authenticated account id.
import { createHash } from "node:crypto";
import { REFERRER_STEP_UP_PURPOSE, type ReferrerStepUpPurpose } from "../shared/referrerStepUp";

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

export function isFreshStepUpProof(_proof: StepUpRecord | undefined, _context: { userId: number; sessionKeyHash: string; account: StepUpAccount | undefined; profile: StepUpProfile; now: number }): boolean {
  return false;
}

/** A process-local store with the same semantics as the MySQL one, for tests and local runs without a database. */
export function createMemoryStepUpStore(): ReferrerStepUpStore & { rows: () => StepUpRecord[] } {
  const rows: StepUpRecord[] = [];
  return {
    rows: () => rows.map(row => ({ ...row })),
    async insertChallenge() { /* contract only (red first) */ },
    async supersedePending() { /* contract only (red first) */ },
    async findByChallengeIdHash() { return undefined; },
    async recordWrongAttempt() { /* contract only (red first) */ },
    async consume() { return false; },
    async supersedeProofs() { /* contract only (red first) */ },
    async latestProof() { return undefined; },
    async addressOfRecord() { return null; },
    async revokeForUser() { /* contract only (red first) */ },
    async isReferrerOfRequest() { return false; },
  };
}

export const STEP_UP_PURPOSE = REFERRER_STEP_UP_PURPOSE;
