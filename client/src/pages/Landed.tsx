import { ArrowRight, BadgeCheck, Check, DoorOpen, Gift, Heart, PartyPopper, Send } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";

const STEPS = ["Celebrate", "Thank", "Pay it forward", "Done"] as const;
const PAY_IT_FORWARD = [
  ["You choose every request", "Passing is private and always okay."],
  ["Set your own capacity", "Even 1 request a month helps."],
  ["Stay anonymous", "Until you accept."],
] as const;

/**
 * Kit landed journey (app/src/routes/landed.tsx). It names no referrer, role or
 * company: those come from a real hire in a later wave, so nothing here is
 * sample data. The thank-you is copied for the seeker to send from their
 * conversation; nothing is sent from this page.
 */
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
    <main data-skipwait-screen="landed" className="page-content">
      <ol className="mb-8 grid grid-cols-4 gap-1.5" aria-label="Landed journey">
        {STEPS.map((label, i) => (
          <li key={label}><span className={`block h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} /><span className="mt-1.5 block text-xs text-muted-foreground">{label}</span></li>
        ))}
      </ol>

      {step === 0 ? (
        <section className="text-center">
          <span className="mx-auto grid size-24 place-items-center rounded-full bg-accent"><PartyPopper className="size-12 text-primary" /></span>
          <h1 className="mt-6 text-4xl font-semibold">You did it.</h1>
          <p className="mt-3 text-muted-foreground">You did the work. A referrer opened the door. Let&apos;s close the loop kindly.</p>
          <Button className="mt-8" onClick={() => setStep(1)}>Thank your referrer <ArrowRight /></Button>
        </section>
      ) : null}

      {step === 1 ? (
        <section>
          <Heart className="mb-3 text-primary" />
          <h1 className="text-3xl font-semibold">Say thanks.</h1>
          <p className="mt-2 text-muted-foreground">The single message referrers remember most.</p>
          <textarea aria-label="Thank-you message" value={message} maxLength={600} onChange={event => setMessage(event.target.value)} className="mt-6 min-h-36 w-full rounded-2xl border border-input bg-background p-4 text-base" />
          <Panel tone="muted" className="mt-6 text-sm"><Gift className="mb-2 size-5" />Gifts or payments for referrals aren&apos;t allowed on skipwait.me. A real thank-you is enough.</Panel>
          <div className="mt-8 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>Skip</Button>
            <Button onClick={() => { void copyThanks().then(() => setStep(2)); }}><Send />{copied ? "Copied" : "Copy thanks"}</Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section>
          <DoorOpen className="mb-3 text-primary" />
          <h1 className="text-3xl font-semibold">Hold the door for the next person.</h1>
          <p className="mt-2 text-muted-foreground">Once you have your new work email, verify in 30 seconds and refer people you believe in — at your own pace.</p>
          <div className="mt-6 grid gap-3">
            {PAY_IT_FORWARD.map(([title, hint]) => (
              <div key={title} className="flex gap-3 rounded-2xl border border-border p-4"><BadgeCheck className="size-5 shrink-0 text-primary" /><span><strong className="block">{title}</strong><small className="text-muted-foreground">{hint}</small></span></div>
            ))}
          </div>
          <div className="mt-8 grid gap-2 sm:grid-cols-2">
            <Button variant="outline" asChild><Link href="/explore">Back to skipwait.me</Link></Button>
            <Button onClick={() => { setPayForward("yes"); setStep(3); }}>Yes, I&apos;ll pay it forward</Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="text-center">
          <Check className="mx-auto size-12 text-primary" />
          <h1 className="mt-4 text-3xl font-semibold">{payForward ? "Welcome to the other side of the door." : "Done."}</h1>
          <p className="mt-2 text-muted-foreground">Verify your new work email whenever you&apos;re ready.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button variant="outline" asChild><Link href="/requests">Close my other asks</Link></Button>
            <Button asChild><Link href="/verify">Verify work email <ArrowRight /></Link></Button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
