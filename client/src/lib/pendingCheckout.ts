// Return-from-checkout recovery shared by /premium and /plans (GO-LIVE-1 C6,
// moved unchanged from Premium.tsx). Before redirecting to the hosted page a
// screen stores { hostedPageId, role } for this tab; on ?payment=pending it
// asks POST /api/chargebee/credit-recovery to match the provider record, at
// once, at 2.5 s and 7.5 s and on window focus, three attempts per run.
// Credits are only ever added by the server; this only asks it to look.
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { TokenRole } from "@/lib/tokens";

export const PENDING_CHECKOUT_STORAGE_KEY = "skipwait.pending-chargebee-checkout";

export type PendingCheckout = { hostedPageId: string; role: TokenRole };
export type RecoveryState = "checking" | "pending" | "credited" | "requires_review";

const pendingCheckoutSchema = z.object({ hostedPageId: z.string().min(1), role: z.enum(["job_seeker", "referrer"]) });

// The recovery answer: credited (with the credit count and the fresh summary),
// requires_review or pending. Anything else, or a failed read, counts as pending.
const recoveryPayloadSchema = z.object({
  status: z.string().optional().catch(undefined),
  tokenCount: z.number().int().optional().catch(undefined),
  summary: z.unknown().optional(),
});

export function savePendingCheckout(checkout: PendingCheckout) {
  if (typeof window !== "undefined") window.sessionStorage.setItem(PENDING_CHECKOUT_STORAGE_KEY, JSON.stringify(checkout));
}

export function readPendingCheckout(role: TokenRole): PendingCheckout | undefined {
  try {
    const value = typeof window === "undefined" ? null : window.sessionStorage.getItem(PENDING_CHECKOUT_STORAGE_KEY);
    const parsed = value ? pendingCheckoutSchema.safeParse(JSON.parse(value)) : undefined;
    return parsed?.success && parsed.data.role === role ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function clearPendingCheckout() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(PENDING_CHECKOUT_STORAGE_KEY);
}

/** The return screen's heading and line for each recovery state. */
export function recoveryCopy(recovery: RecoveryState, creditedTokens: number): { title: string; body: string } {
  if (recovery === "credited") return { title: `${creditedTokens || "Your"} referral credit${creditedTokens === 1 ? " is" : "s are"} ready.`, body: "Your verified payment is complete and your available credits are updated." };
  if (recovery === "requires_review") return { title: "We’re checking this payment securely.", body: "Your transaction is protected. We will only add credits after the provider record matches your checkout." };
  return { title: "We’re confirming your payment.", body: "Nothing else is needed from you. We will add credits as soon as the provider’s verified record reaches our server." };
}

type RecoveryInput = {
  /** True on the ?payment=pending return screen. */
  enabled: boolean;
  isSignedIn: boolean;
  role: TokenRole;
  getToken: () => Promise<string | null | undefined>;
  /** Receives the summary the server sends with a credited answer. */
  onCredited?: (summary: unknown) => void;
};

export function usePendingCheckoutRecovery({ enabled, isSignedIn, role, getToken, onCredited }: RecoveryInput): { recovery: RecoveryState; creditedTokens: number } {
  const [recovery, setRecovery] = useState<RecoveryState>("checking");
  const [creditedTokens, setCreditedTokens] = useState(0);
  const creditedCallback = useRef(onCredited);
  creditedCallback.current = onCredited;

  useEffect(() => {
    if (!enabled || !isSignedIn || recovery === "credited") return;
    const checkout = readPendingCheckout(role);
    if (!checkout) { setRecovery("pending"); return; }
    let active = true;
    let attempts = 0;
    const reconcile = async () => {
      if (!active || attempts >= 3) return;
      attempts += 1;
      try {
        const sessionToken = await getToken();
        const response = await fetch("/api/chargebee/credit-recovery", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) }, body: JSON.stringify({ hostedPageId: checkout.hostedPageId, role }) });
        const parsed = recoveryPayloadSchema.safeParse(await response.json().catch(() => ({})));
        const payload = parsed.success ? parsed.data : {};
        if (!active) return;
        if (payload.status === "credited") {
          setRecovery("credited");
          setCreditedTokens(payload.tokenCount ?? 0);
          creditedCallback.current?.(payload.summary);
          clearPendingCheckout();
          return;
        }
        setRecovery(payload.status === "requires_review" ? "requires_review" : "pending");
      } catch {
        if (active) setRecovery("pending");
      }
    };
    void reconcile();
    const secondAttempt = window.setTimeout(() => { void reconcile(); }, 2500);
    const thirdAttempt = window.setTimeout(() => { void reconcile(); }, 7500);
    const retryOnFocus = () => { void reconcile(); };
    window.addEventListener("focus", retryOnFocus);
    return () => { active = false; window.clearTimeout(secondAttempt); window.clearTimeout(thirdAttempt); window.removeEventListener("focus", retryOnFocus); };
  }, [enabled, getToken, isSignedIn, recovery, role]);

  return { recovery, creditedTokens };
}
