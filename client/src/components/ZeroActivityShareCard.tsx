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

  return <button data-skipwait-zero-action={audience} aria-label={`Share ${audience} zero-activity message`} onClick={() => { void share(); }} className="mt-6 grid h-14 w-14 place-items-center rounded-2xl border border-blue-100 bg-blue-50 text-[#0B57D0] transition active:scale-[.97]"><Share2 className="h-5 w-5" /></button>;
}
