// GO-LIVE-1b ruling 5: a paid pass always activates. After checkout the seeker
// returns here; when the webhook has not landed yet this screen asks the
// server to recover the pass from the provider's own checkout page - bounded
// retries, then the honest "still confirming" message. A pack keeps the
// static message (packs recover on /premium).
import { useEffect, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { apiFetch } from "@/lib/apiFetch";
import { clearPendingCheckout, readPendingCheckout } from "./PlansKitSections";
import { kitDate } from "./format";
import type { Role } from "./PlansKitSections";

type RecoveryState = "checking" | "activated" | "review" | "cancelled" | "still_pending";
type RecoveryResponse = { status?: string; summary?: { subscriptionCurrentTermEnd?: string | null } };

// Bounded: three tries in all, shared by the delays and the focus re-check (ruling 2).
const RETRY_DELAYS_MS = [0, 2_500, 7_500] as const;

export function PendingCheckoutReturn({ role, getToken }: { role: Role; getToken: () => Promise<string | null> }) {
  const pending = readPendingCheckout();
  const isPass = pending?.kind === "plan";
  const [state, setState] = useState<RecoveryState>(isPass ? "checking" : "still_pending");
  const [endsAt, setEndsAt] = useState<string | null>(null);

  useEffect(() => {
    if (!isPass || !pending) return;
    let stopped = false;
    let settled = false; // a terminal answer needs no further try
    let tries = 0;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async (): Promise<void> => {
      if (stopped || settled || inFlight) return;
      inFlight = true;
      tries += 1;
      try {
        const token = await getToken();
        const response = await apiFetch("/api/chargebee/subscription-recovery", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ hostedPageId: pending.hostedPageId, role: pending.role }),
        });
        const payload = await response.json().catch(() => ({})) as RecoveryResponse;
        if (stopped) return;
        if (payload.status === "activated") {
          settled = true;
          setEndsAt(payload.summary?.subscriptionCurrentTermEnd ? kitDate(payload.summary.subscriptionCurrentTermEnd) : null);
          setState("activated");
          clearPendingCheckout();
          return;
        }
        if (payload.status === "requires_review") { settled = true; setState("review"); return; }
        if (payload.status === "cancelled") { settled = true; setState("cancelled"); clearPendingCheckout(); return; }
      } catch { /* one failed try only means "still confirming" */ }
      finally { inFlight = false; }
      if (stopped || settled) return;
      if (tries < RETRY_DELAYS_MS.length) timer = setTimeout(() => void attempt(), RETRY_DELAYS_MS[tries]);
      else setState("still_pending");
    };
    // Ruling 2: coming back to the tab re-checks at once, inside the same three tries.
    const onFocus = () => {
      if (stopped || settled || inFlight || tries >= RETRY_DELAYS_MS.length) return;
      if (timer) { clearTimeout(timer); timer = undefined; }
      void attempt();
    };
    timer = setTimeout(() => void attempt(), RETRY_DELAYS_MS[0]);
    window.addEventListener("focus", onFocus);
    return () => { stopped = true; if (timer) clearTimeout(timer); window.removeEventListener("focus", onFocus); };
  }, [isPass, pending?.hostedPageId, pending?.role, getToken]);

  if (state === "activated") {
    return <section className="workspace-empty"><span className="empty-icon"><Check /></span><h2>Your pass is active.</h2>
      <p>{endsAt ? `Ends ${endsAt} — your allowance stays until then.` : "Your allowance is ready to use."}</p>
      <Button asChild className="brand-button"><Link href="/requests">View my requests<ArrowRight /></Link></Button></section>;
  }
  if (state === "review") {
    return <section className="workspace-empty"><span className="empty-icon"><Check /></span><h2>We’re confirming your pass with the payment provider.</h2>
      <p>Nothing more is charged. If it is not active within an hour, contact support@skipwait.me and we will sort it out.</p>
      <Button asChild className="brand-button"><Link href="/requests">View my requests<ArrowRight /></Link></Button></section>;
  }
  if (state === "cancelled") {
    return <section className="workspace-empty"><span className="empty-icon"><Check /></span><h2>That checkout expired before payment.</h2>
      <p>Nothing was charged. Start checkout again whenever you’re ready.</p>
      <Button asChild className="brand-button"><Link href="/plans">Back to plans<ArrowRight /></Link></Button></section>;
  }
  return <section className="workspace-empty"><span className="empty-icon"><Check /></span><h2>We’re confirming your payment.</h2><p>Access starts only after the verified payment event reaches our server.</p><Button asChild className="brand-button"><Link href="/requests">View my requests<ArrowRight /></Link></Button></section>;
}
