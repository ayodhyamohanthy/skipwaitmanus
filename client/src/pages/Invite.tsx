<<<<<<< HEAD
import { ArrowLeft, ArrowRight, Check, Copy, Mail, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
=======
import { ArrowLeft, Share2, UsersRound } from "lucide-react";
import { useState } from "react";
import { Link, useSearch } from "wouter";
>>>>>>> 57d8bbdec3818a6d6bb1dff1e38f9b552b201c81
import { SignInButton, useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { Button, buttonVariants } from "@/components/kit/button";
import { CompanyRequestPanel } from "@/components/referrer-home/CompanyRequestPanel";
import { InviteLinkPanel } from "@/components/referrer-home/InviteLinkPanel";

type Mode = "request" | "invite";

function SignedOutPanel({ mode }: { mode: Mode }) {
  return (
    <section className="invite-panel" aria-label={mode === "request" ? "Request a company" : "Personal invite link"}>
      <span className="eyebrow">{mode === "request" ? "SEEKER DEMAND" : "REFERRER NETWORK"}</span>
      <h2>{mode === "request" ? "Tell us where you want to work." : "Invite someone inside."}</h2>
      <p>{mode === "request" ? "Sign in to send a request. It does not create a referral request." : "Sign in to get your personal invite link. They choose whether to verify and help."}</p>
      <SignInButton className={buttonVariants()}>Sign in</SignInButton>
    </section>
  );
}

export default function Invite() {
  const { isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
<<<<<<< HEAD
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"colleagues" | "company">("colleagues");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = inviteCode ? `${origin}/verify?invite=${encodeURIComponent(inviteCode)}` : "";

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    setLoading(true); setError("");
    void (async () => {
      try {
        const token = await fetchToken();
        const response = await fetch("/api/personal-invites/me", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const payload = await readApiJson<{ invite?: { inviteCode?: string }; error?: string }>(response, "Your personal invite link is temporarily unavailable. Please try again.");
        if (!response.ok) throw new Error(payload.error || "Your personal invite link is temporarily unavailable. Please try again.");
        if (active) setInviteCode(payload.invite?.inviteCode ?? "");
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "We could not create your personal link. Try again."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [fetchToken, isSignedIn]);

  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); } catch { /* clipboard unavailable */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const share = async () => {
    if (!link) return;
    const text = "Help job seekers at your company get private referrals on SkipWait. Verify a work email to choose which requests you take.";
    try {
      if (navigator.share) { await navigator.share({ title: "Join me on SkipWait", text, url: link }); return; }
      await navigator.clipboard.writeText(`${text} ${link}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* dismissed */ }
  };

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="invite-sign-in" className="mx-auto max-w-xl px-5 py-6">
        <p className="eyebrow">Grow one useful door at a time</p>
        <h1 className="mt-2 text-3xl font-semibold">Invite someone inside.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Share a neutral invitation. They choose whether to verify and help.</p>
        <div className="mt-6"><SignInButton><button type="button" className="brand-button w-full">Sign in</button></SignInButton></div>
      </main>
    );
  }

  return (
    <main data-skipwait-screen="invite" className="page-content mx-auto max-w-2xl">
      <Link href="/referrer-home" className="back-link"><ArrowLeft />Back to referrer home</Link>
      <div className="mb-6"><span className="eyebrow">Referrer network</span><h1 className="mt-2 text-4xl font-semibold">Invite a trusted colleague<span className="brand-dot">.</span></h1><p className="mt-2 max-w-xl text-[var(--muted-foreground)]">Share a neutral invitation. They choose whether to verify a work email and help — nothing is posted publicly and nobody is spammed.</p></div>

      <div className="mb-4 flex rounded-full bg-[var(--muted)] p-1 text-sm" role="tablist" aria-label="Invite options">
        <button type="button" role="tab" aria-selected={mode === "colleagues"} onClick={() => setMode("colleagues")} className={`min-h-11 flex-1 rounded-full px-4 ${mode === "colleagues" ? "bg-[var(--background)] font-semibold shadow-sm" : "text-[var(--muted-foreground)]"}`}>Invite colleagues</button>
        <button type="button" role="tab" aria-selected={mode === "company"} onClick={() => setMode("company")} className={`min-h-11 flex-1 rounded-full px-4 ${mode === "company" ? "bg-[var(--background)] font-semibold shadow-sm" : "text-[var(--muted-foreground)]"}`}>Request a company</button>
      </div>

      {mode === "company" ? (
        <section className="rounded-3xl border-2 border-[var(--foreground)] p-6 shadow-[var(--shadow-offset)] sm:p-8" aria-label="Request a company">
          <h2 className="text-xl font-semibold">Know someone inside a company not listed?</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Suggest it. We&apos;ll review the company and open it for verified referrers — no spam, no public posting.</p>
          <Link href="/suggest-company" className="brand-button mt-4">Suggest a company <ArrowRight /></Link>
        </section>
      ) : (
      <section className="rounded-3xl border-2 border-[var(--foreground)] p-6 shadow-[var(--shadow-offset)] sm:p-8" aria-label="Personal invite link">
        {loading ? <p className="text-sm text-[var(--muted-foreground)]">Creating your personal link…</p> : null}
        {error ? <p role="alert" className="text-sm font-semibold text-[var(--destructive)]">{error}</p> : null}
        {!loading && !error && link ? (
          <>
            <label className="block text-sm font-semibold">Your invite link
              <span className="mt-2 flex min-h-12 items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 pl-4 font-mono text-xs"><span className="truncate">{link}</span></span>
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => { void copy(); }} className="brand-button"><Copy />{copied ? "Copied" : "Copy link"}</button>
              <button type="button" onClick={() => { void share(); }} className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]"><Share2 />Share</button>
              <a href={`mailto:?subject=${encodeURIComponent("Private referrals at your company")}&body=${encodeURIComponent(`Verify a work email to choose which referral requests you take. ${link}`)}`} className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]"><Mail />Email</a>
            </div>
            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[var(--muted-foreground)]"><Check className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" />One link per person. Invites are claimed privately at sign-in — your colleague&apos;s decision stays theirs.</p>
          </>
        ) : null}
      </section>
      )}
=======
  const fromReferrer = new URLSearchParams(useSearch()).get("mode") === "invite";
  const [mode, setMode] = useState<Mode>(fromReferrer ? "invite" : "request");
  const [round, setRound] = useState(0);
  const choose = (next: Mode) => { setMode(next); setRound(value => value + 1); };

  return (
    <main data-skipwait-screen={isSignedIn ? "invite" : "invite-sign-in"} className="page-content invite-page">
      <Link className="back-link" href={fromReferrer ? "/referrer-home" : "/explore"}><ArrowLeft />{fromReferrer ? "Back to referrer home" : "Back to explore"}</Link>
      <div className="page-heading"><div><span className="eyebrow">GROW ONE USEFUL DOOR AT A TIME</span><h1>Who should join<br />SkipWait next<span className="brand-dot">?</span></h1><p>Signal seeker demand or invite someone who can genuinely help.</p></div></div>
      <div className="intent-switch invite-switch">
        <Button variant="ghost" aria-pressed={mode === "request"} className={mode === "request" ? "selected" : ""} onClick={() => choose("request")}><UsersRound />Request a company</Button>
        <Button variant="ghost" aria-pressed={mode === "invite"} className={mode === "invite" ? "selected" : ""} onClick={() => choose("invite")}><Share2 />Invite someone inside</Button>
      </div>
      {!isSignedIn ? <SignedOutPanel mode={mode} /> : mode === "request"
        ? <CompanyRequestPanel key={round} fetchToken={fetchToken} onOtherPath={() => choose("invite")} />
        : <InviteLinkPanel fetchToken={fetchToken} userId={userId ?? null} />}
>>>>>>> 57d8bbdec3818a6d6bb1dff1e38f9b552b201c81
    </main>
  );
}
