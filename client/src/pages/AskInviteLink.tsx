import { useEffect, useState } from "react";
import { useAuth } from "@/_core/auth";
import { GoalButton } from "@/components/goal/GoalButton";
import { AskInviteApiError, claimAskInvite, fetchAskInviteLanding } from "@/components/requests/askInviteApi";
import { ASK_INVITE_STATE_COPY, type AskInviteClaimOutcome, type AskInviteLanding, type AskInviteLandingState } from "@shared/askInvites";
import { usePersistFn } from "@/hooks/usePersistFn";
import { BYOR_LINK } from "@/lib/flags";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { useRoute } from "wouter";

const FAILURE_COPY = "We couldn’t open this referral request link. Try again in a moment.";

function useNoIndex(): void {
  useEffect(() => {
    let meta = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const created = !meta;
    const previous = meta?.content;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.appendChild(meta);
    }
    meta.content = "noindex,nofollow";
    return () => {
      if (created) meta?.remove();
      else if (meta && previous !== undefined) meta.content = previous;
    };
  }, []);
}

function claimOutcomeCopy(outcome: AskInviteClaimOutcome): string {
  if (outcome === "delivered") return "You have this referral request. It is now in your company inbox.";
  if (outcome === "held") return "This referral request is held for you. No credit was available, so it has not been delivered yet.";
  return "This referral request is reserved for you and will be delivered when you have room.";
}

function stateFromClaimError(error: AskInviteApiError): AskInviteLandingState | null {
  if (error.status === 404 || error.code === "not_available") return "unavailable";
  if (error.code === "link_used") return "used";
  if (error.code === "link_expired") return "expired";
  if (error.code === "link_revoked") return "revoked";
  if (error.code === "ask_unavailable") return "closed";
  return null;
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <main data-skipwait-screen="ask-invite-link" className="min-h-dvh bg-g-canvas font-g-sans text-g-body text-g-ink">
      <header className="border-b border-g-hairline bg-g-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-5">
          <a href="/" aria-label="skipwait.me home" className="inline-flex items-center"><img src="/brand/lockup-horizontal-v2.svg" alt="skipwait.me" className="h-5 w-auto" /></a>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-5 py-8">{children}</div>
    </main>
  );
}

function SignInAction({ token, companyName }: { token: string; companyName: string }) {
  return (
    <div className="grid gap-2">
      <p className="text-g-meta text-g-ink-2">Sign in with a verified work email at {companyName || "this company"} to take this referral request.</p>
      <GoalButton asChild variant="primary"><a href={referrerSignInHref(`/r/${token}`)}>Use your company email</a></GoalButton>
    </div>
  );
}

export default function AskInviteLink() {
  const [, params] = useRoute("/r/:token");
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const getTokenRef = usePersistFn(getToken);
  const token = params?.token ?? "";
  const [invite, setInvite] = useState<AskInviteLanding | null>(null);
  const [loading, setLoading] = useState(BYOR_LINK);
  const [unavailable, setUnavailable] = useState(!BYOR_LINK);
  const [loadError, setLoadError] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimOutcome, setClaimOutcome] = useState<AskInviteClaimOutcome | null>(null);
  const [claimError, setClaimError] = useState<"work_email" | "account_unavailable" | "retry" | null>(null);

  useNoIndex();

  useEffect(() => {
    if (!BYOR_LINK) {
      setLoading(false);
      setUnavailable(true);
      return;
    }
    if (!isLoaded) return;
    if (!token) {
      setLoading(false);
      setUnavailable(true);
      return;
    }
    let active = true;
    setLoading(true);
    setUnavailable(false);
    setLoadError(false);
    setInvite(null);
    setClaimOutcome(null);
    setClaimError(null);
    void fetchAskInviteLanding(token, getTokenRef).then(result => {
      if (!active) return;
      setInvite(result);
      setUnavailable(result.state === "unavailable");
      setLoading(false);
    }).catch(error => {
      if (!active) return;
      setUnavailable(error instanceof AskInviteApiError && error.status === 404);
      setLoadError(!(error instanceof AskInviteApiError && error.status === 404));
      setLoading(false);
    });
    return () => { active = false; };
  }, [getTokenRef, isLoaded, isSignedIn, token]);

  const signInHref = referrerSignInHref(`/r/${token}`);
  const claim = async () => {
    if (!token || claiming) return;
    setClaiming(true);
    setClaimError(null);
    try {
      const outcome = await claimAskInvite(token, getTokenRef);
      setClaimOutcome(outcome);
    } catch (error) {
      if (error instanceof AskInviteApiError) {
        const state = stateFromClaimError(error);
        if (state) {
          setInvite(current => current ? { ...current, state, note: null, lockedFileCount: null } : current);
          setUnavailable(state === "unavailable");
          return;
        }
        if (error.status === 401 || error.code === "company_email_required") {
          setClaimError("work_email");
          return;
        }
        if (error.code === "referrer_unavailable") {
          setClaimError("account_unavailable");
          return;
        }
      }
      setClaimError("retry");
    } finally {
      setClaiming(false);
    }
  };

  if (!BYOR_LINK || unavailable) {
    return <PageFrame><section className="mx-auto max-w-xl rounded-g-tile border border-g-hairline bg-g-surface p-5 gdesk:p-7"><h1 className="text-g-heading text-g-ink">Referral request unavailable</h1><p role="status" className="mt-2 text-g-body text-g-ink-2">{ASK_INVITE_STATE_COPY.unavailable}</p></section></PageFrame>;
  }
  if (!isLoaded || loading) {
    return <PageFrame><section role="status" aria-busy="true" className="mx-auto max-w-xl rounded-g-tile border border-g-hairline bg-g-surface p-5 gdesk:p-7"><h1 className="text-g-heading text-g-ink">Opening this referral request…</h1><p className="mt-2 text-g-body text-g-ink-2">Checking that this referral request link is still available.</p></section></PageFrame>;
  }
  if (loadError || !invite) {
    return <PageFrame><section className="mx-auto max-w-xl rounded-g-tile border border-g-hairline bg-g-surface p-5 gdesk:p-7"><h1 className="text-g-heading text-g-ink">Referral request unavailable</h1><p role="alert" className="mt-2 text-g-body text-g-ink-2">{FAILURE_COPY}</p><GoalButton variant="ghost" className="mt-3" onClick={() => window.location.reload()}>Try again</GoalButton></section></PageFrame>;
  }

  if (claimOutcome) {
    return <PageFrame><section className="mx-auto max-w-xl rounded-g-tile border border-g-hairline bg-g-surface p-5 gdesk:p-7"><p className="text-g-meta text-g-ink-3">Referral request</p><h1 className="mt-2 text-g-heading text-g-ink">You have a next step.</h1><p role="status" className="mt-3 text-g-body text-g-ink-2">{claimOutcomeCopy(claimOutcome)}</p></section></PageFrame>;
  }

  const terminal = invite.state !== "open" && invite.state !== "claimed_by_you";
  if (terminal) {
    return <PageFrame><section className="mx-auto max-w-xl rounded-g-tile border border-g-hairline bg-g-surface p-5 gdesk:p-7"><h1 className="text-g-heading text-g-ink">Referral request link status</h1><p role="status" className="mt-3 text-g-body text-g-ink-2">{ASK_INVITE_STATE_COPY[invite.state]}</p></section></PageFrame>;
  }

  const canClaim = isSignedIn && invite.lockedFileCount !== null;
  const publicFacts = [invite.jobFunction, invite.workMode, invite.location].filter((value): value is string => Boolean(value));
  return (
    <PageFrame>
      <section className="mx-auto max-w-xl rounded-g-tile border border-g-hairline bg-g-surface p-5 gdesk:p-7">
        <p className="text-g-meta text-g-ink-3">A private referral request shared with you</p>
        <p className="mt-2 text-g-body text-g-ink-2">{invite.companyName || "A company"}</p>
        <h1 className="mt-1 text-g-display text-g-ink">{invite.roleTitle || "Referral request"}</h1>
        {publicFacts.length ? <p className="mt-2 text-g-meta text-g-ink-2">{publicFacts.join(" · ")}</p> : null}
        <p role={invite.state === "claimed_by_you" ? "status" : undefined} className="mt-4 text-g-body text-g-ink-2">{ASK_INVITE_STATE_COPY[invite.state]}</p>

        {invite.note ? <div className="mt-5 border-t border-g-hairline pt-4"><h2 className="text-g-label text-g-ink">Why this role</h2><p className="mt-2 whitespace-pre-wrap text-g-body text-g-ink-2">{invite.note}</p></div> : null}
        {invite.lockedFileCount !== null ? <p className="mt-3 text-g-meta text-g-ink-2">{invite.lockedFileCount === 0 ? "No files are attached." : `${invite.lockedFileCount} ${invite.lockedFileCount === 1 ? "file stays" : "files stay"} locked until you accept.`} The seeker’s name and files remain hidden until acceptance.</p> : null}

        {invite.state === "open" ? (
          <div className="mt-6 grid gap-3">
            {canClaim ? <GoalButton variant="primary" busy={claiming} busyLabel="Taking this referral request…" onClick={() => { void claim(); }}>Take this referral request</GoalButton> : <SignInAction token={token} companyName={invite.companyName ?? ""} />}
            {claimError === "work_email" ? <><p role="status" className="text-g-meta text-g-ink-2">Use a verified work email at {invite.companyName || "this company"} to take this referral request.</p><GoalButton asChild variant="ghost"><a href={signInHref}>Sign in with your work email</a></GoalButton></> : null}
            {claimError === "account_unavailable" ? <p role="status" className="text-g-meta text-g-ink-2">This account can’t take this referral request right now.</p> : null}
            {claimError === "retry" ? <p role="alert" className="text-g-meta text-g-ink-2">We couldn’t take this referral request. It has not been changed; try again.</p> : null}
          </div>
        ) : null}
      </section>
    </PageFrame>
  );
}
