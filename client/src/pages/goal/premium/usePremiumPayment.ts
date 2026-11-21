import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { apiFetch } from "@/lib/apiFetch";
import { captureClientError } from "@/lib/sentry";
import { PENDING_PREMIUM_CHECKOUT_KEY, premiumRecoverySchema, premiumSummarySchema, readPremiumCheckout } from "@/lib/premiumPurchase";
import type { PremiumBalance } from "@/lib/premiumPurchase";
import type { TokenRole } from "@/lib/tokens";

type Recovery = { state: "checking" | "pending" | "missing" | "error" | "requires_review" | "credited"; count?: number };

/**
 * One confirmation attempt covers token lookup, the recovery request and its body.
 * A stalled confirmation shows help, retains the stored reference and retries at most twice.
 */
const CONFIRM_DEADLINE_MS = 15000;

export function usePremiumPayment(role: TokenRole, pending: boolean) {
  const auth = useAuth();
  const fetchToken = usePersistFn(auth.getToken);
  const client = useQueryClient();
  const account = `${auth.userId ?? ""}:${auth.isLoaded && auth.isSignedIn}:${role}`;
  const currentAccount = useRef(account);
  currentAccount.current = account;
  useEffect(() => {
    currentAccount.current = account;
    return () => { currentAccount.current = "unmounted"; };
  }, [account]);

  const [storedRecovery, setRecovery] = useState<{ account: string; result: Recovery } | null>(null);
  const balanceKey = ["premium-balance", auth.userId, role];
  const balance = useQuery({
    queryKey: balanceKey,
    enabled: auth.isLoaded && auth.isSignedIn && role === "job_seeker" && !pending,
    retry: false,
    queryFn: async () => {
      const token = await fetchToken();
      const response = await apiFetch(`/api/credits/summary?role=${role}`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error("Your balance did not load.");
      return premiumSummarySchema.parse(await response.json()).summary;
    },
  });

  useEffect(() => {
    if (!pending || !auth.isLoaded || !auth.isSignedIn) return;
    const hostedPageId = readPremiumCheckout(role);
    if (!hostedPageId) { setRecovery({ account, result: { state: "missing" } }); return; }
    let active = true;
    let attempts = 0;
    let inFlight = false;
    let settled = false;
    let retryTimer: number | undefined;
    let cancelAttempt: (() => void) | undefined;
    const publish = (result: Recovery) => { if (active && currentAccount.current === account) setRecovery({ account, result }); };
    const reconcile = async () => {
      if (!active || inFlight || settled || attempts >= 3) return;
      window.clearTimeout(retryTimer);
      inFlight = true;
      attempts += 1;
      const controller = new AbortController();
      let stopAttempt: ((reason: "timeout" | "cancelled") => void) | undefined;
      const stopped = new Promise<"timeout" | "cancelled">(resolve => {
        stopAttempt = reason => { controller.abort(); resolve(reason); };
      });
      const deadline = window.setTimeout(() => stopAttempt?.("timeout"), CONFIRM_DEADLINE_MS);
      cancelAttempt = () => stopAttempt?.("cancelled");
      const confirm = async () => {
        const token = await fetchToken();
        if (!active || currentAccount.current !== account || controller.signal.aborted) return null;
        const response = await apiFetch("/api/chargebee/credit-recovery", {
          method: "POST", credentials: "include", signal: controller.signal,
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ hostedPageId, role }),
        });
        if (!response.ok) throw new Error("Recovery unavailable");
        return premiumRecoverySchema.parse(await response.json());
      };
      try {
        const result = await Promise.race([confirm(), stopped]);
        if (result === "timeout") throw new Error("Payment confirmation timed out");
        if (!result || result === "cancelled" || !active || currentAccount.current !== account || controller.signal.aborted) return;
        if (result.status === "credited") {
          settled = true;
          publish({ state: "credited", count: result.tokenCount });
          if (result.summary) client.setQueryData<PremiumBalance>(balanceKey, result.summary);
          if (readPremiumCheckout(role) === hostedPageId) window.sessionStorage.removeItem(PENDING_PREMIUM_CHECKOUT_KEY);
          void client.invalidateQueries({ queryKey: ["credit-balance"] });
          return;
        }
        settled = result.status === "requires_review";
        publish({ state: result.status });
      } catch {
        if (active && currentAccount.current === account) {
          captureClientError(new Error("Premium payment confirmation failed"), { source: "premium-recovery" });
          publish({ state: "error" });
        }
      } finally {
        window.clearTimeout(deadline);
        cancelAttempt = undefined;
        inFlight = false;
        if (active && currentAccount.current === account && !settled && attempts < 3) {
          retryTimer = window.setTimeout(() => { void reconcile(); }, attempts === 1 ? 2500 : 5000);
        }
      }
    };
    publish({ state: "checking" });
    void reconcile();
    const focus = () => { void reconcile(); };
    window.addEventListener("focus", focus);
    return () => { active = false; window.clearTimeout(retryTimer); cancelAttempt?.(); window.removeEventListener("focus", focus); };
  }, [account, auth.isLoaded, auth.isSignedIn, client, fetchToken, pending, role]);

  return {
    auth,
    balance,
    recovery: storedRecovery?.account === account ? storedRecovery.result : { state: "checking" } as Recovery,
  };
}
