import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/auth";
import { GoalButton, GoalField, GoalTextInput } from "@/components/goal";
import { startLogin } from "@/const";
import { readApiJson } from "@/lib/apiResponse";

function open(url: string) { window.open(url, "_blank", "noopener,noreferrer"); }

export default function GoalShareHub() {
  const { isSignedIn } = useAuth();
  const [inviteCode, setInviteCode] = useState("");
  const [email, setEmail] = useState("");
  // D-153: the header states the real state. A signed-in mount has not answered yet, so it
  // starts "creating" — never "ready" — and only a real code can make it ready.
  const [loading, setLoading] = useState(isSignedIn);
  const [linkError, setLinkError] = useState("");
  // A sign-in or sign-out on this mount invalidates the previous answer.
  const [seenSignedIn, setSeenSignedIn] = useState(isSignedIn);
  if (seenSignedIn !== isSignedIn) { setSeenSignedIn(isSignedIn); setInviteCode(""); setLoading(isSignedIn); setLinkError(""); }
  const origin = typeof window === "undefined" ? "https://skipwait.me" : window.location.origin;
  const link = useMemo(() => inviteCode ? `${origin}/start?invite=${encodeURIComponent(inviteCode)}` : "", [inviteCode, origin]);
  const message = useMemo(() => link ? `You found an opportunity! Now help your friends do the same.\n\nJoin skipwait.me with my link. We each get 1 extra referral - it unlocks with your first referral request.\n\n${link}` : "", [link]);
  const emailInviteHref = useMemo(() => { const recipient = email.trim(); if (!link || !/^\S+@\S+\.\S+$/.test(recipient)) return ""; return `mailto:${recipient}?subject=${encodeURIComponent("You found an opportunity. Help a friend do the same.")}&body=${encodeURIComponent(message)}`; }, [email, link, message]);
  // Only a real code makes the header ready; every other state says what is actually true.
  const linkStatus = linkError ? "We could not create your personal link." : link ? "Your link is ready." : loading ? "Creating your link…" : "Your personal link is unavailable.";

  const loadInvite = useCallback(() => { if (!isSignedIn) return; setLoading(true); setLinkError(""); void fetch("/api/personal-invites/me", { credentials: "include" }).then(async response => { if (!response.ok) throw new Error("Your personal invite link is temporarily unavailable. Please try again."); return readApiJson<{ invite?: { inviteCode?: string } }>(response, "Your personal invite link is temporarily unavailable. Please try again."); }).then(data => setInviteCode(data.invite?.inviteCode ?? "")).catch((reason: Error) => setLinkError(reason.message || "We could not create your personal link. Try again.")).finally(() => setLoading(false)); }, [isSignedIn]);
  useEffect(() => { loadInvite(); }, [loadInvite]);
  const copyLink = async () => { if (!link) return; try { await navigator.clipboard.writeText(link); toast("Personal link copied."); } catch { toast("Copy is unavailable in this browser."); } };
  const share = (channel: "x" | "facebook" | "linkedin" | "medium" | "telegram") => { if (!link) return; if (channel === "x") return open(`https://x.com/intent/post?text=${encodeURIComponent(message)}`); if (channel === "facebook") return open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`); if (channel === "linkedin") return open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`); if (channel === "telegram") return open(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message)}`); void navigator.clipboard.writeText(message).then(() => toast("Invite copied. Paste it into a Medium story."), () => toast("Copy the personal link and paste it into Medium.")); open("https://medium.com/new-story"); };

  if (!isSignedIn) {
    return <main data-skipwait-screen="share-hub" data-testid="goal-share-hub" className="g-scope page-content mx-auto w-full max-w-xl pb-10">
      <header className="px-4 pt-6 gdesk:px-5 gdesk:pt-7">
        <h1 className="text-g-display text-g-ink">Help a friend find their next role.</h1>
        <p className="mt-2 text-g-meta text-g-ink-2">Sign in to share one personal link.</p>
      </header>
      <section aria-label="Your next step" className="mx-4 my-5 border border-g-hairline p-4 gdesk:mx-5">
        <h2 className="text-g-heading text-g-ink">Your next step</h2>
        <p className="mt-2 text-g-label text-g-ink">Create your invite link.</p>
        <div className="mt-4"><GoalButton variant="primary" onClick={() => startLogin()}>Sign in to continue</GoalButton></div>
      </section>
    </main>;
  }

  return <main data-skipwait-screen="share-hub" data-testid="goal-share-hub" className="g-scope page-content mx-auto w-full max-w-xl pb-10">
    <header className="px-4 pt-6 gdesk:px-5 gdesk:pt-7">
      <h1 className="text-g-display text-g-ink">Help a friend find their next role.</h1>
      <p className="mt-2 flex items-center gap-2 text-g-meta text-g-ink-2">
        <span aria-hidden="true" className={`size-(--g-dot) shrink-0 rounded-full ${linkError ? "bg-g-crimson" : "bg-g-ink"}`} />
        <span>{linkStatus} When a friend joins with it, you each get 1 extra referral - it unlocks when you send your next private referral request.</span></p>
    </header>

    <section aria-label="Your next step" className="mx-4 my-5 border border-g-hairline p-4 gdesk:mx-5" data-skipwait-share-content="true">
      <h2 className="text-g-heading text-g-ink">Your next step</h2>
      <p className="mt-2 text-g-label text-g-ink">Share your personal link.</p>
      {link ? <code className="mt-3 block truncate rounded-g-tile bg-g-surface-sunken px-3 py-2 text-g-meta text-g-ink">{link}</code> : null}
      {linkError ? <p role="alert" className="mt-3 text-g-meta text-g-crimson">{linkError}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        {linkError
          ? <GoalButton variant="primary" onClick={() => loadInvite()}>Try again</GoalButton>
          : <GoalButton variant="primary" disabledReason={link ? undefined : loading ? "Creating your link…" : "Link unavailable"} onClick={() => { void copyLink(); }}>Copy link</GoalButton>}
      </div>
    </section>

    <section aria-label="Other ways to share" className="mx-4 gdesk:mx-5">
      <h2 className="text-g-label text-g-ink">Other ways to send it</h2>
      <div className="mt-3"><GoalField label="Send by email">
        <div className="flex gap-2">
          <GoalTextInput aria-label="Friend email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} placeholder="friend@gmail.com" />
          <GoalButton variant="outline" asChild={Boolean(emailInviteHref)} disabledReason={emailInviteHref ? undefined : "Enter one email address"} onClick={emailInviteHref ? undefined : () => toast("Enter one email address.")}>
            {emailInviteHref ? <a href={emailInviteHref}>Invite</a> : <>Invite</>}
          </GoalButton>
        </div>
      </GoalField></div>
      <div className="mt-4 flex flex-wrap gap-2">
        <GoalButton variant="ghost" disabledReason={link ? undefined : "Link unavailable"} onClick={() => share("x")}>X</GoalButton>
        <GoalButton variant="ghost" disabledReason={link ? undefined : "Link unavailable"} onClick={() => share("facebook")}>Facebook</GoalButton>
        <GoalButton variant="ghost" disabledReason={link ? undefined : "Link unavailable"} onClick={() => share("linkedin")}>LinkedIn</GoalButton>
        <GoalButton variant="ghost" disabledReason={link ? undefined : "Link unavailable"} onClick={() => share("telegram")}>Telegram</GoalButton>
        <GoalButton variant="ghost" disabledReason={link ? undefined : "Link unavailable"} onClick={() => share("medium")}>Medium</GoalButton>
      </div>
      <p className="mt-4 text-g-meta text-g-ink-3">Rewards apply once per verified new account. Self-invites and duplicate accounts are not eligible.</p>
      <p className="mt-4"><Link href="/requests" className="text-g-meta text-g-ink-2 underline underline-offset-[3px] hover:text-g-ink">Back to my requests</Link></p>
    </section>
  </main>;
}
