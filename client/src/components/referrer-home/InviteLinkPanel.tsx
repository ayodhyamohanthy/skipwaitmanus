// "Invite someone inside" side of /invite (kit v4 invite.tsx), carrying the
// live personal invite link: copy, email and native share (clipboard
// fallback). The link comes from /api/personal-invites/me only.
import { Check, Copy, Mail, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/kit/button";
import { fetchPersonalInviteCode, type TokenSource } from "./referrerData";

const SHARE_TEXT = "Help job seekers at your company get private referrals on SkipWait. Verify a work email to choose which requests you take.";

export function InviteLinkPanel({ fetchToken, userId }: { fetchToken: TokenSource; userId: string | null }) {
  const invite = useQuery({ queryKey: ["personal-invite", userId], queryFn: () => fetchPersonalInviteCode(fetchToken), retry: 1, refetchOnWindowFocus: false });
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = invite.data ? `${origin}/verify?invite=${encodeURIComponent(invite.data)}` : "";
  const flash = () => { setCopied(true); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1500); };
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); } catch { /* clipboard unavailable: the link stays visible to copy by hand */ }
    flash();
  };
  const share = async () => {
    if (!link) return;
    try {
      if (typeof navigator.share === "function") { await navigator.share({ title: "Join me on SkipWait", text: SHARE_TEXT, url: link }); return; }
      await navigator.clipboard.writeText(`${SHARE_TEXT} ${link}`);
      flash();
    } catch { /* dismissed or clipboard unavailable */ }
  };

  return (
    <section className="invite-panel" aria-label="Personal invite link">
      <span className="eyebrow">REFERRER NETWORK</span>
      <h2>Invite a trusted colleague.</h2>
      <p>Share a neutral invitation. They choose whether to verify and open their door—no pressure, no referral obligation.</p>
      {invite.isPending ? <p role="status">Creating your personal link…</p> : invite.isError ? (
        <>
          <p role="alert" className="font-semibold text-destructive">{invite.error.message || "We could not create your personal link. Try again."}</p>
          <Button variant="outline" disabled={invite.isFetching} onClick={() => { void invite.refetch(); }}>{invite.isFetching ? "Trying again…" : "Try again"}</Button>
        </>
      ) : (
        <>
          <div className="share-link"><span className="min-w-0 truncate">{link.replace(/^https?:\/\//, "")}</span><Button variant="ghost" size="icon" aria-label="Copy invitation link" onClick={() => { void copy(); }}>{copied ? <Check /> : <Copy />}</Button></div>
          {copied ? <p role="status">Copied</p> : null}
          <Button asChild><a href={`mailto:?subject=${encodeURIComponent("Private referrals at your company")}&body=${encodeURIComponent(`${SHARE_TEXT} ${link}`)}`}><Mail />Email invite</a></Button>
          <Button variant="outline" onClick={() => { void share(); }}><Share2 />Share</Button>
          <p>One link per person. Invites are claimed privately at sign-in — your colleague&apos;s decision stays theirs.</p>
        </>
      )}
    </section>
  );
}
