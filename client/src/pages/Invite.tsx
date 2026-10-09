import { ArrowLeft, Share2, UsersRound } from "lucide-react";
import { useState } from "react";
import { Link, useSearch } from "wouter";
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
    </main>
  );
}
