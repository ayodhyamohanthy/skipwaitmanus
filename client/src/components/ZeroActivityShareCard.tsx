import { Copy, Linkedin, Mail, MessageCircleMore, Share2, UsersRound } from "lucide-react";
import { toast } from "sonner";

type ZeroActivityAudience = "job_seeker" | "referrer";

type ZeroActivityShareCardProps = {
  audience: ZeroActivityAudience;
};

function openShareUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function ZeroActivityShareCard({ audience }: ZeroActivityShareCardProps) {
  const origin = typeof window === "undefined" ? "https://skipwait.me" : window.location.origin;
  const isJobSeeker = audience === "job_seeker";
  const link = isJobSeeker ? `${origin}/start` : `${origin}/referrer`;
  const title = isJobSeeker ? "Know one person who may have a useful lead?" : "Know one person who may need a referral?";
  const body = isJobSeeker
    ? "Share a simple ask only with someone you genuinely know. They can send you a real job link; you do not need to ask them to join skipwait.me."
    : "Share only if you are genuinely open to considering a referral. Your identity remains private and you always decide whether to help.";
  const text = isJobSeeker
    ? `I’m looking for a referral for a role that fits. If your company is hiring or you know of a real job link, please send it to me. I can prepare a private referral request through skipwait.me.\n\n${link}`
    : `I can consider private referral requests for suitable roles at my company. If you have a real job link that may fit, skipwait.me helps you prepare a private request. I decide whether I can help.\n\n${link}`;
  const copy = async (message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(message);
    } catch {
      toast("Copy is unavailable here. Use WhatsApp, email, LinkedIn, or X instead.");
    }
  };
  const share = async (channel: "whatsapp" | "email" | "linkedin" | "x" | "more") => {
    if (channel === "whatsapp") return openShareUrl(`https://wa.me/?text=${encodeURIComponent(text)}`);
    if (channel === "email") return openShareUrl(`mailto:?subject=${encodeURIComponent(isJobSeeker ? "A quick job-referral question" : "A private referral option")}&body=${encodeURIComponent(text)}`);
    if (channel === "linkedin") { await copy("Message copied. Paste it into a LinkedIn message only where it is relevant."); return openShareUrl("https://www.linkedin.com/messaging/"); }
    if (channel === "x") return openShareUrl(`https://x.com/intent/post?text=${encodeURIComponent(text)}`);
    const nativeShare = (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share;
    if (nativeShare) return nativeShare.call(navigator, { title: "skipwait.me", text, url: link }).catch(() => undefined);
    await copy("Message copied. Share it only where it will be useful.");
  };

  return <article data-skipwait-zero-action={audience} className="mt-5 rounded-xl border border-blue-100 bg-blue-50/70 p-3.5">
    <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#0B57D0] shadow-sm"><UsersRound className="h-4.5 w-4.5" /></span><div><p className="text-[10px] font-bold uppercase tracking-[.13em] text-[#0B57D0]">One useful next action</p><h2 className="mt-1 text-[14px] font-semibold tracking-[-.02em] text-slate-950">{title}</h2><p className="mt-1 text-[11px] leading-4 text-slate-600">{body}</p></div></div>
    <div className="mt-3 grid grid-cols-5 gap-1.5"><button aria-label={`Share ${audience} zero-activity message on WhatsApp`} onClick={() => { void share("whatsapp"); }} className="rounded-lg border border-blue-100 bg-white py-2 text-[#0B57D0]"><MessageCircleMore className="mx-auto h-4 w-4" /></button><button aria-label={`Share ${audience} zero-activity message by email`} onClick={() => { void share("email"); }} className="rounded-lg border border-blue-100 bg-white py-2 text-[#0B57D0]"><Mail className="mx-auto h-4 w-4" /></button><button aria-label={`Share ${audience} zero-activity message on LinkedIn`} onClick={() => { void share("linkedin"); }} className="rounded-lg border border-blue-100 bg-white py-2 text-[#0B57D0]"><Linkedin className="mx-auto h-4 w-4" /></button><button aria-label={`Share ${audience} zero-activity message on X`} onClick={() => { void share("x"); }} className="rounded-lg border border-blue-100 bg-white py-2 text-sm font-bold text-[#0B57D0]">X</button><button aria-label={`More ways to share ${audience} zero-activity message`} onClick={() => { void share("more"); }} className="rounded-lg border border-blue-100 bg-white py-2 text-[#0B57D0]">{typeof navigator !== "undefined" && typeof (navigator as Navigator & { share?: unknown }).share === "function" ? <Share2 className="mx-auto h-4 w-4" /> : <Copy className="mx-auto h-4 w-4" />}</button></div>
  </article>;
}
