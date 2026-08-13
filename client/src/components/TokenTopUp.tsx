import { Coins, Plus } from "lucide-react";
import { Link } from "wouter";

export function TokenTopUp() {
  const isReferrer = typeof window !== "undefined" && window.location.pathname.startsWith("/referrer");
  return <Link href={isReferrer ? "/premium?role=referrer" : "/premium"} className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(15,23,42,.28)] transition hover:-translate-y-0.5"><span className="grid h-5 w-5 place-items-center rounded-full bg-violet-500"><Plus className="h-3.5 w-3.5"/></span><Coins className="h-4 w-4 text-violet-300"/>Buy tokens · $1 each</Link>;
}
