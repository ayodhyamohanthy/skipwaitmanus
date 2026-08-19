import { Linkedin, Mail, MessageCircleMore, Share2, Twitter } from "lucide-react";
import { toast } from "sonner";

type OneTapShareActionsProps = { title: string; message: string; link: string; className?: string };

export function OneTapShareActions({ title, message, link, className = "" }: OneTapShareActionsProps) {
  const shareText = `${message}\n\n${link}`;
  const encodedText = encodeURIComponent(shareText); const encodedLink = encodeURIComponent(link); const encodedSubject = encodeURIComponent(title);
  const more = async () => {
    try {
      if (navigator.share) { await navigator.share({ title, text: message, url: link }); return; }
      await navigator.clipboard.writeText(shareText); toast("Opening link copied.");
    } catch { /* The person chose not to share; no error state is needed. */ }
  };
  const actionClass = "flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-1 text-[10px] font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 active:scale-[.97]";
  return <div aria-label="Share this opening" className={`grid grid-cols-5 gap-1.5 ${className}`}><a aria-label="Share on WhatsApp" href={`https://wa.me/?text=${encodedText}`} target="_blank" rel="noreferrer" className={actionClass}><MessageCircleMore className="h-4 w-4 text-[#25D366]" /><span>WhatsApp</span></a><a aria-label="Share by email" href={`mailto:?subject=${encodedSubject}&body=${encodedText}`} className={actionClass}><Mail className="h-4 w-4 text-[#0B57D0]" /><span>Email</span></a><a aria-label="Share on LinkedIn" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedLink}`} target="_blank" rel="noreferrer" className={actionClass}><Linkedin className="h-4 w-4 text-[#0A66C2]" /><span>LinkedIn</span></a><a aria-label="Share on X" href={`https://x.com/intent/post?text=${encodedText}`} target="_blank" rel="noreferrer" className={actionClass}><Twitter className="h-4 w-4 text-slate-950" /><span>X</span></a><button type="button" aria-label="More sharing options" onClick={() => { void more(); }} className={actionClass}><Share2 className="h-4 w-4 text-[#0B57D0]" /><span>More</span></button></div>;
}
