import { LoaderCircle } from "lucide-react";

/**
 * Shared loading skeleton for the pending screens (spec §2.2 / §2.4).
 *
 * Three bars + one honest caption. Pass `slow` after the 15 s fallback
 * threshold to append the "taking longer than expected" line. The region is
 * `aria-busy` and `role="status"` so assistive tech announces the caption
 * without the skeleton bars becoming noise.
 */
export function LoadingSkeleton({ title, caption, slow = false, slowMessage = "This is taking longer than expected. You can keep waiting or come back in a moment — nothing was lost." }: { title: string; caption?: string; slow?: boolean; slowMessage?: string }) {
  return <div role="status" aria-busy="true" aria-live="polite" data-skipwait-loading="true" className="rounded-xl border border-[#e5e5e5] bg-white p-4">
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#ededff] text-black"><LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" /></span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-black">{title}</p>
        {caption ? <p className="mt-0.5 text-xs leading-5 text-[#505050]">{caption}</p> : null}
      </div>
    </div>
    <div aria-hidden="true" className="mt-4 space-y-2">
      <div className="h-2.5 w-3/4 animate-pulse rounded-full bg-[#f0f0f0] motion-reduce:animate-none" />
      <div className="h-2.5 w-full animate-pulse rounded-full bg-[#f0f0f0] motion-reduce:animate-none" />
      <div className="h-2.5 w-5/6 animate-pulse rounded-full bg-[#f0f0f0] motion-reduce:animate-none" />
    </div>
    {slow ? <p data-skipwait-loading-slow="true" className="mt-4 rounded-lg bg-[#b45309]/10 px-3 py-2 text-xs leading-5 text-[#b45309]">{slowMessage}</p> : null}
  </div>;
}
