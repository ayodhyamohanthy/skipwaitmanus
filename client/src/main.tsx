import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./_core/auth";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import { getGlobalAccessToken } from "./_core/accessToken";
import { initializeDevicePreferences } from "./lib/device";
import "./index.css";
import { bootstrapSmoke, smokeFetch } from "./contexts/smokeRuntime";
import { captureClientError, initClientSentry, testClientSentry } from "./lib/sentry";
import { initClarity } from "./lib/clarity";
import { applyAnalyticsConsent, readCookieConsent } from "./components/CookieConsent";

const clientSentryActive = initClientSentry();
if (import.meta.env.DEV) {
  console.info(`[Sentry] client reporting ${clientSentryActive ? "ACTIVE" : "INACTIVE (set VITE_SENTRY_DSN and restart dev to enable)"}`);
  window.__sentryTest = testClientSentry;
}
const clarityActive = initClarity();
// Apply the stored cookie choice on every entry route, not only when the home page mounts the banner.
applyAnalyticsConsent(readCookieConsent());
if (import.meta.env.DEV) {
  console.info(`[Clarity] replay reporting ${clarityActive ? "ACTIVE" : "INACTIVE (set VITE_CLARITY_PROJECT_ID and restart dev to enable)"}`);
}
if (typeof window !== "undefined") {
  window.addEventListener("error", event => captureClientError(event.error ?? event.message, { source: "window.onerror" }));
  window.addEventListener("unhandledrejection", event => captureClientError(event.reason, { source: "unhandledrejection" }));
}

const queryClient = new QueryClient();

function initializeDeviceDefaults() {
  if (typeof window === "undefined") return;
  // Keep locale available to Intl consumers without declaring the English-only
  // interface translated or exposing the device preference in the DOM.
  initializeDevicePreferences(navigator, document.documentElement);
}

initializeDeviceDefaults();

if (import.meta.env.DEV) {
  // Preview sessions may retain a service worker from a production build. Remove it
  // here so Vite always renders the latest source during iterative design work.
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => { void registration.unregister(); });
  });
} else {
  // Navigation is network-first in the worker, so deep links always prefer the
  // current deploy and only fall back to the cached shell when offline.
  void navigator.serviceWorker?.register("/sw.js").then(registration => {
    registration.update().catch(() => undefined);
    // A waiting worker means a newer deploy is installed. Only prompt when an older worker
    // already controls the page (first installs have nothing to update from).
    const announce = (worker: ServiceWorker | null) => {
      if (worker && navigator.serviceWorker.controller) window.dispatchEvent(new CustomEvent("skipwait:sw-update", { detail: worker }));
    };
    announce(registration.waiting);
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => { if (worker.state === "installed") announce(worker); });
    });
  }).catch(() => undefined);
}

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    if (!(error instanceof Error && error.message.includes("Unexpected token '<'"))) console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    if (!(error instanceof Error && error.message.includes("Unexpected token '<'"))) console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // AuthKit SDK access token first (JWT verified server-side via JWKS).
        const sdkToken = getGlobalAccessToken();
        if (sdkToken) return { Authorization: `Bearer ${sdkToken}` };
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      fetch(input, init) {
        return smokeFetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

const mount=()=>createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      {/* Auth reads the server session via tRPC (works for both the
          AuthKit and work-email OTP planes), so it must sit INSIDE tRPC. */}
      <AuthProvider>
        <App />
      </AuthProvider>
    </trpc.Provider>
  </QueryClientProvider>
);;
const nativeFetch=globalThis.fetch.bind(globalThis);
void bootstrapSmoke(nativeFetch).finally(()=>{globalThis.fetch=smokeFetch as typeof fetch;mount()});
