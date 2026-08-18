import { Share2 } from "lucide-react";
import { toast } from "sonner";

type ZeroActivityAudience = "job_seeker" | "referrer";

type ZeroActivityShareCardProps = {
  audience: ZeroActivityAudience;
};

export function ZeroActivityShareCard({ audience }: ZeroActivityShareCardProps) {
  const origin = typeof window === "undefined" ? "https://skipwait.me" : window.location.origin;
  const isJobSeeker = audience === "job_seeker";
  const link = isJobSeeker ? `${origin}/start` : `${origin}/referrer`;
  const title = isJobSeeker ? "Ask one trusted person." : "Share when it is relevant.";
  const body = isJobSeeker
    ? "They may know a real job link."
    : "You always choose whether to help.";
  const text = isJobSeeker
    ? `I’m looking for a referral for a role that fits. If your company is hiring or you know of a real job link, please send it to me. I can prepare a private referral request through skipwait.me.\n\n${link}`
    : `I can consider private referral requests for suitable roles at my company. If you have a real job link that may fit, skipwait.me helps you prepare a private request. I decide whether I can help.\n\n${link}`;
  const share = async () => {
    const nativeShare = (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share;
    if (nativeShare) return nativeShare.call(navigator, { title: "skipwait.me", text, url: link }).catch(() => undefined);
    try {
      await navigator.clipboard.writeText(text);
      toast("Message copied. Share it when useful.");
    } catch {
      toast("Sharing is unavailable in this browser.");
    }
  };

  return <article data-skipwait-zero-action={audience} className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-3.5"><h2 className="text-sm font-semibold tracking-[-.02em] text-slate-950">{title}</h2><p className="mt-1 text-xs text-slate-600">{body}</p><button aria-label={`Share ${audience} zero-activity message`} onClick={() => { void share(); }} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-sm font-bold text-[#0B57D0]"><Share2 className="h-4 w-4" />{isJobSeeker ? "Share a quick ask" : "Share availability"}</button>
  </article>;
}
