import { Link } from "wouter";

function PublicBrandMark(_: { dark?: boolean }) {
  return <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-[6px] bg-[#E8442E] text-white`}><svg viewBox="0 0 32 32" className="h-[18px] w-[18px]" fill="none"><path d="M7 17.5 13.5 24 25 9" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>;
}

export function Brand({ dark = false }: { dark?: boolean }) {
  return <Link href="/" className="inline-flex items-center gap-2.5 group" aria-label="skipwait.me home"><span className="transition-transform group-hover:-rotate-6"><PublicBrandMark dark={dark} /></span><span className={`font-display text-[22px] font-semibold uppercase leading-none tracking-[0.01em] ${dark ? "text-white" : "text-[#191713]"}`}>skipwait<span className="text-[#E8442E]">.me</span></span></Link>;
}
