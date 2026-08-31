import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import superjson from "superjson";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { startLogin } from "./const";
import { getGlobalAccessToken } from "./_core/accessToken";
import { resolveDeviceLocale } from "./lib/device";
import "./index.css";

const queryClient = new QueryClient();

function initializeDeviceDefaults() {
  if (typeof window === "undefined") return;
  const locale = resolveDeviceLocale(navigator);
  document.documentElement.lang = locale;
  document.documentElement.dataset.deviceLocale = locale;
}

initializeDeviceDefaults();

if (import.meta.env.DEV) {
  // Preview sessions may retain a service worker from a production build. Remove it
  // here so Vite always renders the latest source during iterative design work.
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => { void registration.unregister(); });
  });
} else {
  registerSW({
    immediate: true,
    onRegisterError(error) {
      console.error("[PWA] Service worker registration failed", error);
    },
  });
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
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      {/* Auth compat reads the server session via tRPC (works for both the
          AuthKit and work-email OTP planes), so it must sit INSIDE tRPC. */}
      <ClerkProvider>
        <App />
      </ClerkProvider>
    </trpc.Provider>
  </QueryClientProvider>
);
