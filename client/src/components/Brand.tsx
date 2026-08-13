import { Link } from "wouter";

export function Brand({ dark = false }: { dark?: boolean }) {
  return <Link href="/" className="inline-flex items-center gap-2.5 group" aria-label="skipwait.me home"><span className={`grid h-9 w-9 place-items-center rounded-lg transition-transform group-hover:-rotate-3 ${dark ? "bg-white/15 text-white" : "bg-[#0B57D0] text-white"}`}><svg viewBox="0 0 32 32" className="h-[20px] w-[20px]" fill="none" aria-hidden="true"><path d="M4 16h24M19.5 9.5 26 16l-6.5 6.5M12.5 9.5 6 16l6.5 6.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" /><circle cx="16" cy="16" r="2.3" fill="currentColor" /></svg></span><span className={`text-[19px] font-semibold tracking-[-0.045em] ${dark ? "text-white" : "text-slate-950"}`}>skipwait<span className="text-[#0B57D0]">.me</span></span></Link>;
}
