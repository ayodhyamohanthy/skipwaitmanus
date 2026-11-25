import { signInRedirectTarget } from "@/lib/signInRedirect";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Start sign-in from wherever the person is (the global unauthorized handler in main.tsx, ShareHub): referrer
// pages open the work-email sign-in, every other page opens skipwait.me's /sign-in and returns here afterwards
// (client/src/lib/signInRedirect.ts). Never navigates from an auth page. Call it from an event handler or effect
// at the moment you want to navigate, e.g. `onClick={() => startLogin()}` — never during render.
export const startLogin = (returnTo?: string) => {
  if (typeof window === "undefined") return;
  const target = signInRedirectTarget(window.location, returnTo);
  if (target) window.location.assign(target);
};
