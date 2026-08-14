import { LogIn, ShieldCheck, UserRound } from "lucide-react";
import { SignInButton, useAuth, useUser } from "@clerk/react";

export function AccountStatus() {
  const { isSignedIn } = useAuth();
  const { user, isLoaded } = useUser();

  if (!isLoaded) return <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500" aria-label="Checking account status"><span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />Checking account…</span>;
  if (!isSignedIn) return <SignInButton mode="modal"><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-200 hover:text-[#0B57D0]"><LogIn className="h-3.5 w-3.5" />Sign in</button></SignInButton>;

  const label = user?.firstName || user?.username || user?.primaryEmailAddress?.emailAddress || "Account";
  return <span className="inline-flex max-w-40 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"><UserRound className="h-3 w-3" /></span><span className="truncate">{label}</span><ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-label="Signed in" /></span>;
}
