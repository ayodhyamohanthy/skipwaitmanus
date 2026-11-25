/**
 * D-174 (owner, Oct 23): "for now I dont require any expiry ... as we are launching". This switch
 * stops the ask's own death clocks — the 7-day unclaimed expiry and the 90-day waiting cap — and
 * nothing else: referrer action timers (48 h claim and allocation lapse, 5-day referred deadline,
 * D-038/D-076), OTP, session and claim-link validity, payment timeouts and retention keep running.
 *
 * D-193 (5): the clocks may only come off with reconfirm-before-spend on, so a contract test fails
 * if this is true while ASK_RECONFIRM_ENABLED is false. Off is byte-for-byte today's behaviour
 * (D-097); the release row D-174-no-expiry-release turns both on together.
 *
 * A leaf module (the shared/askReconfirm.ts pattern, and D-384's reason for shared/poolNudges.ts):
 * shared/referral.ts, server/db.ts and the sweep read one binding without an import cycle, and a
 * test can force either state with `vi.mock` instead of a test-only setter.
 */
export const ASK_NO_EXPIRY_ENABLED = false;

/** D-193 (5): the coupling the release must keep. Returns the failure, or null when the pair is allowed. */
export function askNoExpiryCouplingError(noExpiry: boolean, reconfirm: boolean): string | null {
  return noExpiry && !reconfirm
    ? "ASK_NO_EXPIRY_ENABLED needs ASK_RECONFIRM_ENABLED: an old held ask must be reconfirmed before its first spend (D-193 (5))"
    : null;
}
