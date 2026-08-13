import { GitBranch } from "lucide-react";
import { Link } from "wouter";

export function Brand({ dark = false }: { dark?: boolean }) {
  return <Link href="/" className="inline-flex items-center gap-2.5 group" aria-label="Bridge home"><span className={`grid h-9 w-9 place-items-center rounded-xl transition-transform group-hover:-rotate-3 ${dark ? "bg-white/15 text-white" : "bg-violet-600 text-white"}`}><GitBranch className="h-[18px] w-[18px]" strokeWidth={2.25} /></span><span className={`text-[19px] font-semibold tracking-[-0.045em] ${dark ? "text-white" : "text-slate-950"}`}>Bridge</span></Link>;
}
