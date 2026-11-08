import { useState } from "react";
import { Link } from "wouter";
import { MONEY_SENTENCE } from "@shared/moneyCopy";
import { GoalButton, GoalNextStep } from "@/components/goal";

export const GOAL_PAGE = { goalLine: "See every message skipwait.me sends." } as const;

type Template = {
  name: string;
  channel: "Email" | "Email + in-app" | "In-app" | "Email + Slack";
  trigger: string;
  subject?: string;
  body?: string[];
  cta?: string;
  code?: true;
  push?: string;
};

const TEMPLATES: readonly Template[] = [
  { name: "Work-email code", channel: "Email", trigger: "Sent when a referrer requests a one-time code. 6 digits, 10-minute expiry, 5 attempts.", subject: "Your skipwait.me verification code", body: ["Your skipwait.me verification code is ⟨6-digit code⟩. It expires in 10 minutes and works once.", "If you did not request it, ignore this email - nothing changes."], code: true },
  { name: "Password reset", channel: "Email", trigger: "Sent when someone asks to reset a password. Neutral reply: always “check your email”, whether the account exists or not. 1-hour single-use link.", subject: "Reset your skipwait.me password", body: ["You asked to reset your skipwait.me password. This link works for 1 hour, once: ⟨reset link⟩", "If you did not ask for this, ignore this email — nothing changes. Passwords are managed through secure sign-in; you can also continue with email from the sign-in page."], cta: "Reset link (in the email body)" },
  { name: "Welcome", channel: "Email", trigger: "Sent after first sign-in with the honest next step for the account type." },
  { name: "Request claimed", channel: "Email + in-app", trigger: "A verified employee claims a pending ask. Seeker sees company domain only.", subject: "Your referral request was claimed — ⟨company⟩", body: ["A verified employee at ⟨company⟩ claimed your private referral request."] },
  { name: "Ask accepted", channel: "Email + in-app", trigger: "A referrer accepts. Messaging opens; identities follow the accept rules.", subject: "Your referral was accepted — ⟨company⟩", body: ["A verified employee at ⟨company⟩ accepted your private referral request."], cta: "Open conversation" },
  { name: "Ask passed", channel: "Email + in-app", trigger: "A referrer passes. The ask stays active for other employees; the slot is not freed.", subject: "Update on your referral request — ⟨company⟩", body: ["Your request at ⟨company⟩ remains visible to other verified employees."], cta: "Find another referrer" },
  { name: "New message", channel: "In-app", trigger: "A private message arrives in an accepted conversation." },
  { name: "Waiting for coverage", channel: "In-app", trigger: "An ask has no verified employees available yet at the company." },
  { name: "Slot opened", channel: "Email", trigger: "A referrer opens capacity and waiting asks become reviewable.", subject: "Private referral review available at ⟨company⟩", body: ["A referral review is now available at ⟨company⟩", "A verified employee opened review capacity for your private request. This does not guarantee an introduction, interview, or hiring outcome."], cta: "View private request" },
  { name: "Review ready", channel: "Email + Slack", trigger: "A private review link is prepared for a verified employee. Never includes candidate content.", subject: "Private referral review at ⟨company⟩", body: ["A private review is ready at ⟨company⟩", "Reviewing is optional and never costs you anything. Sign in with your verified company email before any decision is recorded.", "Opening this link never records a decision. Review and confirm on skipwait.me."], cta: "Open private review" },
  { name: "Re-verify reminder", channel: "Email", trigger: "A work-email verification approaches its re-check window." },
  { name: "Report outcome", channel: "In-app", trigger: "A safety report the user filed reaches resolved or dismissed.", push: "Update on your report", body: ["Our safety team reviewed your report and took action. Thank you for flagging it."] },
  { name: "Payment receipt / failed", channel: "Email", trigger: "A credit purchase or subscription event confirms — or a payment fails with next steps." },
];

const SENDER = "skipwait.me <noreply@skipwait.me>";

export default function GoalEmails() {
  const [selected, setSelected] = useState<string>(TEMPLATES[0].name);
  const template: Template = TEMPLATES.find(item => item.name === selected) ?? TEMPLATES[0];
  const emailed = template.channel !== "In-app";
  return (
    <main data-skipwait-screen="emails" data-goal-page="emails" className="g-scope min-h-dvh bg-g-canvas px-5 py-8 font-g-sans text-g-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between py-4">
        <Link href="/" className="inline-flex items-center" aria-label="skipwait.me home"><img src="/brand/lockup-horizontal-v2.svg" alt="skipwait.me" className="h-5 w-auto" /></Link>
        <span className="text-g-meta font-semibold text-g-ink-3">EMAIL & IN-APP TEMPLATES</span>
      </header>
      <div className="mx-auto max-w-6xl">
        <h1 className="text-balance text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
      </div>
      <div className="mx-auto grid max-w-6xl gap-4 pb-16 gdesk:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Templates" className="flex gap-1 overflow-x-auto gdesk:flex-col">
          {TEMPLATES.map(item => {
            const active = item.name === template.name;
            return (
              <button key={item.name} type="button" aria-pressed={active} onClick={() => setSelected(item.name)}
                className={`min-h-11 shrink-0 rounded-g-tile px-4 text-left text-g-meta ${active ? "bg-g-surface font-semibold text-g-ink" : "text-g-ink-3"}`}>
                {item.name}
              </button>
            );
          })}
        </nav>
        <div className="min-w-0 space-y-4">
          {template.push && (
            <div className="mx-auto max-w-sm rounded-g-tile border border-g-hairline bg-g-surface p-3">
              <div className="flex items-center gap-2 text-g-meta text-g-ink-3"><span className="grid size-5 place-items-center rounded bg-g-ink text-[10px] font-bold text-g-on-primary">S</span>SKIPWAIT.ME · now</div>
              <p className="mt-1 text-g-label font-semibold text-g-ink">{template.push}</p>
            </div>
          )}
          <article aria-label={template.name} className="mx-auto max-w-xl overflow-hidden rounded-g-tile border border-g-hairline bg-g-surface">
            <div className="border-b border-g-hairline p-4 text-g-meta">
              <p>{emailed ? <><span className="text-g-ink-3">From:</span> {SENDER}</> : <><span className="text-g-ink-3">In-app:</span> skipwait.me notifications</>}</p>
              {template.subject ? <p className="font-semibold text-g-ink">{template.subject}</p> : <p className="font-semibold text-g-ink">{template.name}</p>}
            </div>
            <div className="p-8">
              <img src="/brand/lockup-horizontal-v2.svg" alt="skipwait.me" className="h-5 w-auto" />
              {(template.body ?? [template.trigger]).map(line => <p key={line} className="mt-4 leading-relaxed text-g-ink">{line}</p>)}
              {template.body ? <p className="mt-4 leading-relaxed text-g-ink-3">Fired when: {template.trigger.replace(/^Sent when /, "")}</p> : null}
              <p className="mt-4 leading-relaxed text-g-ink-3">Sent by: {template.channel}</p>
              {template.code ? <p role="img" aria-label="Six-digit code" className="mt-6 flex justify-center rounded-g-tile bg-g-surface py-5 text-3xl"><span className="flex h-9 items-center gap-[0.8em]">{[0, 1].map(group => <span key={group} className="flex gap-[0.3em]">{[0, 1, 2].map(dot => <span key={dot} className="size-[0.3em] rounded-full bg-g-ink" />)}</span>)}</span></p> : null}
              {template.cta ? <span className="mt-6 inline-block rounded-full bg-g-primary px-6 py-3 font-semibold text-g-on-primary">{template.cta}</span> : null}
              <hr className="my-8 border-g-hairline" />
              <p className="text-g-meta text-g-ink-3">{MONEY_SENTENCE} skipwait.me never asks for your password by email.</p>
            </div>
          </article>
          <div className="mx-auto max-w-xl">
            <GoalNextStep reason="Reference page: these are the messages skipwait.me sends.">
              <GoalButton variant="primary" asChild><Link href="/">Go home</Link></GoalButton>
            </GoalNextStep>
          </div>
        </div>
      </div>
    </main>
  );
}
