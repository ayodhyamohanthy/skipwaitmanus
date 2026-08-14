import { LogIn, LogOut, Repeat2, ShieldCheck } from "lucide-react";
import { SignInButton, useAuth, useUser } from "@clerk/react";

export function AccountStatus() {
  const { isSignedIn, signOut } = useAuth();
  const { user, isLoaded } = useUser();

  if (!isLoaded) return <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500" aria-label="Checking account status"><span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />Checking account…</span>;
  if (!isSignedIn) return <SignInButton mode="modal"><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-200 hover:text-[#0B57D0]"><LogIn className="h-3.5 w-3.5" />Sign in</button></SignInButton>;

  return <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 p-1 text-emerald-800" aria-label="Signed-in account"><ShieldCheck className="mx-1 h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" /><SignInButton mode="modal"><button type="button" title="Switch account" className="grid h-7 w-7 place-items-center rounded-md transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-600" aria-label="Switch account"><Repeat2 className="h-3.5 w-3.5" /></button></SignInButton><button type="button" title="Sign out" onClick={() => { void signOut(); }} className="grid h-7 w-7 place-items-center rounded-md transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-600" aria-label="Sign out"><LogOut className="h-3.5 w-3.5" /></button></span>;
}
