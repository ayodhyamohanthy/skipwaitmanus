import { ArrowRight, BadgeCheck, Check, DoorOpen, Gift, Heart, PartyPopper, Send } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

const STEPS = ["Celebrate", "Thank", "Pay it forward", "Done"] as const;

export default function Landed() {
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("Thank you for taking a chance on my ask — I really appreciate you opening the door.");
  const [copied, setCopied] = useState(false);
  const [payForward, setPayForward] = useState<"yes" | null>(null);

  const copyThanks = async () => {
    try { await navigator.clipboard.writeText(message); } catch { /* clipboard unavailable */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main data-skipwait-screen="landed" className="page-content mx-auto max-w-2xl">
      <ol className="mb-8 grid grid-cols-4 gap-1.5" aria-label="Landed journey">
        {STEPS.map((label, i) => (
          <li key={label}><span className={`block h-1.5 rounded-full ${i <= step ? "bg-[var(--primary)]" : "bg-[var(--muted)]"}`} /><span className="mt-1.5 block text-xs text-[var(--muted-foreground)]">{label}</span></li>
        ))}
      </ol>

      {step === 0 ? (
        <section className="text-center">
          <span className="mx-auto grid size-24 place-items-center rounded-full bg-[var(--accent)]"><PartyPopper className="size-12 text-[var(--primary)]" /></span>
          <h1 className="mt-6 text-4xl font-semibold">You did it.</h1>
          <p className="mt-3 text-lg">You did the work. A referrer opened the door. Let&apos;s close the loop kindly.</p>
          <button type="button" className="brand-button mt-8" onClick={() => setStep(1)}>Thank your referrer <ArrowRight /></button>
        </section>
      ) : null}

      {step === 1 ? (
        <section>
          <Heart className="mb-3 text-[var(--primary)]" />
          <h1 className="text-3xl font-semibold">Say thanks.</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">The single message referrers remember most. Copy it into your conversation — or message from your requests.</p>
          <label className="mt-6 block"><span className="sr-only">Thank-you message</span>
            <textarea value={message} maxLength={600} onChange={event => setMessage(event.target.value)} rows={5} className="min-h-36 w-full rounded-2xl border border-[var(--input)] bg-[var(--background)] p-4 text-base" />
          </label>
          <div className="mt-3 rounded-2xl bg-[var(--muted)] p-4 text-sm"><Gift className="mb-2 size-5" />Gifts or payments for referrals aren&apos;t allowed on SkipWait. A real thank-you is enough.</div>
          <div className="mt-8 flex justify-between gap-3">
            <Link href="/requests" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Open my requests</Link>
            <button type="button" onClick={() => { void copyThanks().then(() => setStep(2)); }} className="brand-button"><Send />{copied ? "Copied" : "Copy thanks"}</button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section>
          <DoorOpen className="mb-3 text-[var(--primary)]" />
          <h1 className="text-3xl font-semibold">Hold the door for the next person.</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">Once you have your new work email, verify in under a minute and refer people you believe in — at your own pace.</p>
          <div className="mt-6 grid gap-3">
            {[["You choose every request", "Passing is private and always okay."], ["Set your own pace", "Even one referral a month helps."], ["Stay anonymous", "Until you accept."]].map(([title, hint]) => (
              <div key={title} className="flex gap-3 rounded-2xl border border-[var(--border)] p-4"><BadgeCheck className="size-5 shrink-0 text-[var(--primary)]" /><span><strong className="block">{title}</strong><small className="text-[var(--muted-foreground)]">{hint}</small></span></div>
            ))}
          </div>
          <div className="mt-8 grid gap-2 sm:grid-cols-2">
            <Link href="/explore" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Back to SkipWait</Link>
            <button type="button" onClick={() => { setPayForward("yes"); setStep(3); }} className="brand-button">Yes, I&apos;ll pay it forward</button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="text-center">
          <Check className="mx-auto size-12 text-[var(--primary)]" />
          <h1 className="mt-4 text-3xl font-semibold">{payForward ? "Welcome to the other side of the door." : "Done."}</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">Verify your new work email whenever you&apos;re ready.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/requests" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Close my other asks</Link>
            <Link href="/verify" className="brand-button">Verify work email <ArrowRight /></Link>
          </div>
        </section>
      ) : null}
    </main>
  );
}
