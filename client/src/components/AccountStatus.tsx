import { LogIn, LogOut, Repeat2, ShieldCheck, UserRound } from "lucide-react";
import { SignInButton, useAuth, useUser } from "@clerk/react";

export function AccountStatus({ mode }: { mode?: "job-seeker" | "referrer" }) {
  const { isSignedIn, signOut } = useAuth();
  const { user, isLoaded } = useUser();

  if (!isLoaded) return <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500" aria-label="Checking account status"><span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />Checking account…</span>;
  if (!isSignedIn) return <SignInButton mode="modal"><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-200 hover:text-[#0B57D0]"><LogIn className="h-3.5 w-3.5" />Sign in</button></SignInButton>;

  const label = user?.primaryEmailAddress?.emailAddress || user?.username || user?.firstName || "Account";
  const pathMode = typeof window !== "undefined" && ["/start", "/request"].includes(window.location.pathname) ? "job-seeker" : typeof window !== "undefined" && window.location.pathname.startsWith("/referrer") ? "referrer" : undefined;
  const activeMode = mode ?? pathMode;
  const switchLabel = activeMode === "job-seeker" ? "Personal email" : activeMode === "referrer" ? "Work email" : "Switch";
  const switchAriaLabel = activeMode === "job-seeker" ? "Switch to personal email" : activeMode === "referrer" ? "Switch to work email" : "Switch account";
  return <span className="inline-flex max-w-[24rem] items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 py-1 pl-2 pr-1 text-xs font-semibold text-emerald-800"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"><UserRound className="h-3 w-3" /></span><span className="max-w-36 truncate" title={label}>Active: {label}</span><ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-label="Signed in" /><SignInButton mode="modal"><button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-600" aria-label={switchAriaLabel}><Repeat2 className="h-3 w-3" />{switchLabel}</button></SignInButton><button type="button" onClick={() => { void signOut(); }} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-600" aria-label="Sign out"><LogOut className="h-3 w-3" />Sign out</button></span>;
}
