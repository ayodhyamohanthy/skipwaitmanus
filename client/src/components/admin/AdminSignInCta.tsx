import { LogIn } from "lucide-react";
import { safeReturnTo } from "@/lib/referrerSignIn";

/** Sign-in link that returns to an admin page afterwards. Same-origin /admin paths only. */
export function adminSignInHref(path: string): string {
  const target = safeReturnTo(path, "/admin");
  return `/sign-in?${new URLSearchParams({ returnTo: target.startsWith("/admin") ? target : "/admin" })}`;
}

/** Shown when an admin call answers 401 or 403. Uses the normal sign-in; grants nothing by itself. */
export function AdminSignInCta({ path, message = "Sign in with the administrator account to use this page." }: { path?: string; message?: string }) {
  const here = path ?? (typeof window === "undefined" ? "/admin" : window.location.pathname);
  return <div role="alert" className="space-y-3 rounded-lg border border-[#e5e5e5] p-4">
    <p className="text-sm font-medium">{message}</p>
    <a href={adminSignInHref(here)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#141414] px-5 text-sm font-bold text-white"><LogIn className="h-4 w-4" />Sign in as administrator</a>
  </div>;
}
