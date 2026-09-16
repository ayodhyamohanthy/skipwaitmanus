import { Link } from "wouter";

function PublicBrandMark({ dark = false }: { dark?: boolean }) {
  return <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${dark ? "bg-white/15 text-white" : "bg-primary text-white"}`}><svg viewBox="0 0 32 32" className="h-[18px] w-[18px]" fill="none"><path d="M4 16h24M19.5 9.5 26 16l-6.5 6.5M12.5 9.5 6 16l6.5 6.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" /><circle cx="16" cy="16" r="2.3" fill="currentColor" /></svg></span>;
}

export function LogoMark(_: { dark?: boolean }) {
  return null;
}

export function Brand({ dark = false }: { dark?: boolean }) {
  // The wordmark follows the supplied logo: "skip" in ink, "wait" in the brand
  // green, no ".me" suffix. The green is `--color-brand`, which holds the exact
  // sampled logo green (#548A4E) rather than the slightly deeper `--color-primary`
  // used for interactive fills, where white text needs 4.5:1.
  return <Link href="/" className="inline-flex items-center gap-2.5 group" aria-label="skipwait.me home"><span className="transition-transform group-hover:-rotate-3"><PublicBrandMark dark={dark} /></span><span className={`text-[19px] font-semibold tracking-[-0.045em] ${dark ? "text-white" : "text-slate-950"}`}>skip<span className="text-brand">wait</span></span></Link>;
}
