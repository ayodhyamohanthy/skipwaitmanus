// First-party funnel events (#102). Fire-and-forget to our own API; no
// third-party script. Only send allowlisted names/props (see server/funnelEventRoutes.ts).
export type FunnelEventName = "landing_view" | "start_link_pasted" | "step1_coverage_shown" | "resume_added" | "signin_prompted" | "request_sent" | "referrer_page_view" | "fast_track_shared" | "invite_sent";

export function trackFunnel(name: FunnelEventName, props: Record<string, string | undefined> = {}) {
  try {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    for (const key of ["utm_source", "utm_medium", "utm_campaign"]) { const v = params.get(key); if (v && !props[key]) props[key] = v; }
    if (document.referrer) { try { const host = new URL(document.referrer).hostname; if (host && host !== window.location.hostname) props.referrerHost = host; } catch {} }
    const body = JSON.stringify({ name, props });
    // sendBeacon only: every current browser has it, it survives page exits,
    // and it never shows up in the app's own fetch traffic.
    navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }));
  } catch { /* never break the page */ }
}
