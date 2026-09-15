import { Link } from "wouter";
export function Brand(_: { dark?: boolean }) {
  return <Link href="/" className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0B57D0]" aria-label="skipwait.me home"><span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-[#0B57D0] text-sm font-bold text-white">↔</span><span className="text-xl font-bold tracking-[-.03em] text-slate-950">skipwait<span className="text-[#0B57D0]">.me</span></span></Link>;
}
