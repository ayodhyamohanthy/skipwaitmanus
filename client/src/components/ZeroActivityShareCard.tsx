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
    ? `Know someone who can help with a referral? Send them this. A real job link becomes a private request on skipwait.me.\n\n${link}`
    : `Know someone looking for a referral? Send them this. They can make a private request from a real job link on skipwait.me.\n\n${link}`;
  const label = isJobSeeker ? "Share with someone who can help" : "Share with a job seeker";
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

  return <button data-skipwait-zero-action={audience} aria-label={label} onClick={() => { void share(); }} className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 text-sm font-bold text-[#0B57D0] transition active:scale-[.97]"><Share2 className="h-4 w-4" />{label}</button>;
}
