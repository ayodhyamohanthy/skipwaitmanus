import { Link } from "wouter";

function PublicBrandMark({ dark = false }: { dark?: boolean }) {
  return <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${dark ? "bg-white/15 text-white" : "bg-[#0B57D0] text-white"}`}><svg viewBox="0 0 32 32" className="h-[18px] w-[18px]" fill="none"><path d="M4 16h24M19.5 9.5 26 16l-6.5 6.5M12.5 9.5 6 16l6.5 6.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" /><circle cx="16" cy="16" r="2.3" fill="currentColor" /></svg></span>;
}

export function LogoMark(_: { dark?: boolean }) {
  return null;
}

export function Brand({ dark = false }: { dark?: boolean }) {
  return <Link href="/" className="inline-flex items-center gap-2.5 group" aria-label="skipwait.me home"><span className="transition-transform group-hover:-rotate-3"><PublicBrandMark dark={dark} /></span><span className={`text-[19px] font-semibold tracking-[-0.045em] ${dark ? "text-white" : "text-slate-950"}`}>skipwait<span className="text-[#0B57D0]">.me</span></span></Link>;
}
