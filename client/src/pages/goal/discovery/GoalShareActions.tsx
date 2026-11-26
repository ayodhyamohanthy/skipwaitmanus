// Goal-native share block for the discovery pages (owner acceptance rule, Oct 30:
// no kit or legacy UI on a moved page). Behaviour is the kit OneTapShareActions'
// exactly: the same five share links (hrefs, targets, rel), the same "More" path
// (the native share sheet with { title, text, url }, else copy "<message>\n\n<link>")
// and the same copy. Only the rendering changes: goal tokens, monochrome icons,
// and the copy confirmation in a goal status line instead of a kit toast.
import { useState } from "react";
import { Linkedin, Mail, MessageCircleMore, Send, Share2, Twitter, type LucideIcon } from "lucide-react";

export type ShareInput = { title: string; message: string; link: string };
export type ShareTarget = { label: string; name: string; href: string; icon: LucideIcon; external: boolean };

/** The kit's five share links, built the same way (pure). */
export function shareTargets({ title, message, link }: ShareInput): ShareTarget[] {
  const text = encodeURIComponent(`${message}\n\n${link}`);
  const url = encodeURIComponent(link);
  return [
    { label: "Share on WhatsApp", name: "WhatsApp", href: `https://wa.me/?text=${text}`, icon: MessageCircleMore, external: true },
    { label: "Share on Telegram", name: "Telegram", href: `https://t.me/share/url?url=${url}&text=${text}`, icon: Send, external: true },
    { label: "Share by email", name: "Email", href: `mailto:?subject=${encodeURIComponent(title)}&body=${text}`, icon: Mail, external: false },
    { label: "Share on LinkedIn", name: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`, icon: Linkedin, external: true },
    { label: "Share on X", name: "X", href: `https://x.com/intent/post?text=${text}`, icon: Twitter, external: true },
  ];
}

const ACTION = "flex min-h-11 flex-col items-center justify-center gap-1 rounded-g-control border border-g-hairline bg-g-surface px-1 text-g-meta text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:border-g-ink hover:bg-g-surface-hover hover:text-g-ink";

export function GoalShareActions({ title, message, link, className = "" }: ShareInput & { className?: string }) {
  const [status, setStatus] = useState("");
  const more = async () => {
    try {
      if (navigator.share) { await navigator.share({ title, text: message, url: link }); return; }
      await navigator.clipboard.writeText(`${message}\n\n${link}`);
      setStatus("Opening link copied.");
    } catch { /* The person chose not to share; no error state is needed. */ }
  };
  return (
    <div data-goal-share className={className}>
      <div aria-label="Share this opening" className="grid grid-cols-3 gap-1.5">
        {shareTargets({ title, message, link }).map(({ label, name, href, icon: Icon, external }) => (
          <a key={name} aria-label={label} href={href} className={ACTION} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
            <Icon aria-hidden="true" className="size-4 text-g-ink" strokeWidth={1.75} /><span>{name}</span>
          </a>
        ))}
        <button type="button" aria-label="More sharing options" onClick={() => { void more(); }} className={ACTION}>
          <Share2 aria-hidden="true" className="size-4 text-g-ink" strokeWidth={1.75} /><span>More</span>
        </button>
      </div>
      <p role="status" aria-live="polite" className="mt-2 text-g-meta empty:mt-0 text-g-ink-2">{status}</p>
    </div>
  );
}

/** The kit ZeroActivityShareCard (audience "job_seeker"): same link, title, message and heading. */
export function GoalZeroActivityShare({ className = "" }: { className?: string }) {
  const origin = typeof window === "undefined" ? "https://skipwait.me" : window.location.origin;
  return (
    <section data-skipwait-zero-action="job_seeker" aria-label="Share this useful next step" className={`w-full max-w-sm ${className}`}>
      <p className="mb-2 text-g-meta text-g-ink-3">Share this useful next step</p>
      <GoalShareActions title="Private referral requests" message="A role link can become a private referral request. See if this is useful for you:" link={`${origin}/start`} />
    </section>
  );
}
