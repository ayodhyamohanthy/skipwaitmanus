export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Start the WorkOS AuthKit sign-in: the browser navigates to the server's
// AuthKit redirect route, which ends at the app_session_id cookie verified by
// tRPC. Call this from an event handler or effect at the moment you want to
// navigate, e.g. `onClick={() => startLogin()}` — never during render.
export const startLogin = () => {
  window.location.href = "/api/auth/workos/sign-in";
};
