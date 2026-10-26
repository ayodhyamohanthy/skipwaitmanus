/**
 * DEVICE-SIGNIN-passkeys phase C (owner, Oct 26): the Google account chooser
 * for returning seekers, on the goal sign-in only. The chooser prompt is owned
 * and drawn by the browser/Google (One Tap, FedCM in Chrome 117+); we never
 * imitate it in-page. Where the browser can't show it, nothing renders and the
 * ordinary goal sign-in (social buttons + email code) is the honest fallback.
 *
 * Referrers never see this: it renders only in the goal sign-in's seeker
 * branch, and the server refuses work-email accounts anyway (D-030/D-057).
 * Client gate: a configured client id; the server route is separately
 * flag-gated off until QA (D-097).
 */
import { useEffect } from "react";

declare global {
  interface Window {
    google?: { accounts?: { id?: {
      initialize: (config: { client_id: string; callback: (response: { credential: string }) => void; nonce?: string }) => void;
      prompt: () => void;
    } } };
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";
let gisLoading: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("GIS load failed"));
      document.head.appendChild(script);
    });
  }
  return gisLoading;
}

export function GoogleOneTap({ returnTo }: { returnTo: string }) {
  const clientId = import.meta.env.VITE_GOOGLE_ONE_TAP_CLIENT_ID as string | undefined;
  useEffect(() => {
    if (!clientId) return; // not configured: no chooser, ordinary sign-in stands
    let cancelled = false;
    loadGis().then(async () => {
      if (cancelled || !window.google?.accounts?.id) return;
      // Login-CSRF binding: the server sets this nonce as an httpOnly cookie
      // and requires it back inside the ID token. A 404 here (flag off) also
      // means no prompt at all.
      const nonceRes = await fetch("/api/auth/google-one-tap/nonce", { credentials: "same-origin" });
      if (!nonceRes.ok) return;
      const { nonce } = await nonceRes.json();
      if (cancelled || !nonce) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        nonce,
        callback: async ({ credential }) => {
          try {
            const res = await fetch("/api/auth/google-one-tap/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify({ credential }),
            });
            const data = await res.json().catch(() => null);
            if (res.ok && data?.signedIn) window.location.assign(returnTo);
          } catch { /* the ordinary sign-in below stays available */ }
        },
      });
      window.google.accounts.id.prompt();
    }).catch(() => { /* GIS unreachable: ordinary sign-in stands */ });
    return () => { cancelled = true; };
  }, [clientId, returnTo]);
  return null; // the chooser is browser-owned; this component renders no UI
}
