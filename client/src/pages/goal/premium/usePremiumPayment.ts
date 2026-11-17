import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { apiFetch } from "@/lib/apiFetch";
import { captureClientError } from "@/lib/sentry";
import { openChargebeeCheckout } from "@/lib/chargebeeCheckout";
import { paymentRouteDetails } from "@/lib/paymentRoute";
import { ONE_TAP_PAY_SIGNIN } from "@/lib/oneTap";
import { LEGACY_PREMIUM_PACKS, PENDING_PREMIUM_CHECKOUT_KEY, premiumCheckoutSchema, premiumRecoverySchema, premiumSummarySchema, readPremiumCheckout } from "@/lib/premiumPurchase";
import type { PremiumBalance } from "@/lib/premiumPurchase";
import type { PaymentRoute } from "@/lib/paymentRoute";
import type { TokenRole } from "@/lib/tokens";

type Recovery = { state: "checking" | "pending" | "missing" | "error" | "requires_review" | "credited"; count?: number };

export function usePremiumPayment(role: TokenRole, pending: boolean, route: PaymentRoute, quantity: number, canBuy: boolean) {
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
    const publish = (result: Recovery) => { if (active && currentAccount.current === account) setRecovery({ account, result }); };
    const reconcile = async () => {
      if (!active || inFlight || settled || attempts >= 3) return;
      window.clearTimeout(retryTimer);
      inFlight = true;
      attempts += 1;
      try {
        const token = await fetchToken();
        if (!active || currentAccount.current !== account) return;
        const response = await apiFetch("/api/chargebee/credit-recovery", {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ hostedPageId, role }),
        });
        if (!response.ok) throw new Error("Recovery unavailable");
        const result = premiumRecoverySchema.parse(await response.json());
        if (!active || currentAccount.current !== account) return;
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
        inFlight = false;
        // A slow request must not consume the next retry's timer slot.
        if (active && currentAccount.current === account && !settled && attempts < 3) {
          retryTimer = window.setTimeout(() => { void reconcile(); }, attempts === 1 ? 2500 : 5000);
        }
      }
    };
    publish({ state: "checking" });
    void reconcile();
    const focus = () => { void reconcile(); };
    window.addEventListener("focus", focus);
    return () => { active = false; window.clearTimeout(retryTimer); window.removeEventListener("focus", focus); };
  }, [account, auth.isLoaded, auth.isSignedIn, client, fetchToken, pending, role]);

  const purchaseOwner = useRef<string | null>(null);
  const [redirectingAccount, setRedirectingAccount] = useState<string | null>(null);
  const checkout = useMutation({
    mutationKey: ["premium-checkout", account],
    mutationFn: async (owner: string) => {
      const token = await fetchToken();
      if (currentAccount.current !== owner) return;
      const selected = LEGACY_PREMIUM_PACKS.find(pack => pack.currency === route);
      if (!selected) throw new Error("Payment currency unavailable");
      const response = await apiFetch("/api/chargebee/checkout", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ itemPriceId: selected.id, billingCountry: paymentRouteDetails(route).billingCountry, role, quantity }),
      });
      if (!response.ok) throw new Error("Checkout unavailable");
      const result = premiumCheckoutSchema.parse(await response.json());
      if (currentAccount.current !== owner) return;
      window.sessionStorage.setItem(PENDING_PREMIUM_CHECKOUT_KEY, JSON.stringify({ hostedPageId: result.hostedPageId, role }));
      setRedirectingAccount(owner);
      openChargebeeCheckout(result.checkoutUrl);
    },
    onError: (_error, owner) => {
      if (purchaseOwner.current === owner) purchaseOwner.current = null;
      if (currentAccount.current === owner) setRedirectingAccount(null);
      captureClientError(new Error("Premium checkout failed"), { source: "premium-checkout" });
    },
  });
  const begin = () => {
    if (!auth.isLoaded || !canBuy || purchaseOwner.current === account) return;
    if (!auth.isSignedIn) {
      const destination = new URL(window.location.href);
      destination.searchParams.set("role", role);
      destination.searchParams.set("quantity", String(quantity));
      destination.searchParams.set("currency", route);
      const returnTo = `${destination.pathname}${destination.search}${destination.hash}`;
      if (ONE_TAP_PAY_SIGNIN && role === "job_seeker") window.location.assign(`/sign-in?${new URLSearchParams({ returnTo })}`);
      else auth.openSignIn({ returnTo });
      return;
    }
    purchaseOwner.current = account;
    checkout.mutate(account);
  };
  return { auth, balance, checkout, checkoutBusy: checkout.isPending || redirectingAccount === account, begin, recovery: storedRecovery?.account === account ? storedRecovery.result : { state: "checking" } as Recovery };
}
