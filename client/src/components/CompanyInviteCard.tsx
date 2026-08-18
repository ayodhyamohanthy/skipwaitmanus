import { Copy, Linkedin, Mail, MessageCircleMore, MoreHorizontal, ShieldCheck, UsersRound } from "lucide-react";
import { toast } from "sonner";

type CompanyInviteCardProps = {
  companyDomain: string;
  placement: "request" | "referrer" | "opportunity";
  compact?: boolean;
};

function companyInviteLink(companyDomain: string) {
  const origin = typeof window === "undefined" ? "https://skipwait.me" : window.location.origin;
  return `${origin}/referrer?company=${encodeURIComponent(companyDomain)}&source=company-invite`;
}

function companyInviteText(companyDomain: string, inviteLink: string) {
  return `I’m using skipwait.me to reach the right people at ${companyDomain}. If you work there, you can join private company coverage with a work email and choose whether to help. Your identity stays hidden from Job Seekers.\n\n${inviteLink}`;
}

async function copyText(value: string, successMessage: string) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard is unavailable");
    await navigator.clipboard.writeText(value);
    toast(successMessage);
  } catch {
    toast("Copy is not available in this browser. Use the link shown below instead.");
  }
}

function openShareUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function CompanyInviteCard({ companyDomain, placement, compact = false }: CompanyInviteCardProps) {
  const inviteLink = companyInviteLink(companyDomain);
  const inviteText = companyInviteText(companyDomain, inviteLink);
  const title = placement === "referrer" ? `Keep ${companyDomain} covered` : placement === "opportunity" ? `Know someone at ${companyDomain}?` : `Know someone at ${companyDomain}?`;
  const body = placement === "referrer"
    ? "Invite one trusted teammate to join private company coverage. They choose whether to verify their work email; no invitation is sent automatically."
    : placement === "opportunity"
      ? "Share a private company invite with someone who works there. It never exposes the employee who posted this opportunity."
      : "Invite one trusted employee to join private company coverage. They choose whether to verify their work email; your request and documents stay private.";

  const shareToWhatsApp = () => openShareUrl(`https://wa.me/?text=${encodeURIComponent(inviteText)}`);
  const shareToEmail = () => openShareUrl(`mailto:?subject=${encodeURIComponent(`Private company coverage at ${companyDomain}`)}&body=${encodeURIComponent(inviteText)}`);
  const shareToLinkedIn = () => {
    void copyText(inviteText, "Invite copied. Paste it into a LinkedIn message.");
    openShareUrl("https://www.linkedin.com/messaging/");
  };
  const shareToX = () => openShareUrl(`https://x.com/intent/post?text=${encodeURIComponent(inviteText)}`);
  const shareMore = () => {
    if (navigator.share) {
      void navigator.share({ title: `Private company coverage at ${companyDomain}`, text: inviteText, url: inviteLink }).catch(() => undefined);
      return;
    }
    void copyText(inviteText, "Invite copied. Paste it into any app you prefer.");
  };

  return <section className={`rounded-2xl border border-blue-100 bg-blue-50/60 ${compact ? "p-4" : "p-5 sm:p-6"}`} aria-label={`Private invitation for ${companyDomain}`}>
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-[#0B57D0]"><UsersRound className="h-3.5 w-3.5" />Private company invitation</p>
        <h2 className={`mt-2 font-semibold tracking-[-.035em] text-slate-950 ${compact ? "text-xl" : "text-2xl"}`}>{title}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{body}</p>
      </div>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#0B57D0] shadow-sm"><ShieldCheck className="h-5 w-5" /></span>
    </div>
    <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-white p-3">
      <span className="min-w-0 truncate text-sm font-semibold text-slate-600">{inviteLink.replace(/^https?:\/\//, "")}</span>
      <button type="button" onClick={() => { void copyText(inviteText, "Private company invite copied."); }} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800 active:scale-[.98]"><Copy className="h-3.5 w-3.5" />Copy</button>
    </div>
    <div className={`mt-3 grid gap-2 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-4"}`}>
      <button type="button" onClick={shareToWhatsApp} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 active:scale-[.98]"><MessageCircleMore className="h-4 w-4 text-[#0B57D0]" />WhatsApp</button>
      <button type="button" onClick={shareToLinkedIn} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 active:scale-[.98]"><Linkedin className="h-4 w-4 text-[#0B57D0]" />LinkedIn</button>
      <button type="button" onClick={shareToEmail} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 active:scale-[.98]"><Mail className="h-4 w-4 text-[#0B57D0]" />Email</button>
      {!compact && <><button type="button" onClick={shareToX} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 active:scale-[.98]">X</button><button type="button" onClick={shareMore} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 active:scale-[.98]"><MoreHorizontal className="h-4 w-4 text-[#0B57D0]" />More apps</button></>}
    </div>
    <p className="mt-4 text-xs leading-5 text-slate-500">This invitation only asks someone to verify a matching work email. It never includes a candidate name, role link, request state, or document.</p>
  </section>;
}

export { companyInviteLink, companyInviteText };
