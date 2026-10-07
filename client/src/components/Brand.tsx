import { ArrowUpRight } from "lucide-react";
import { Link } from "wouter";
export function Brand(_: { dark?: boolean }) {
  return <Link href="/" className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" aria-label="skipwait.me home"><span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-[9px] border-[1.5px] border-black bg-white text-black"><ArrowUpRight className="h-4 w-4" /></span><span className="text-xl font-semibold tracking-[-.04em] text-black">skipwait.me</span></Link>;
}
