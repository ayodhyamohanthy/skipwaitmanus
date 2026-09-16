import { Link } from "wouter";
import { ArrowRight, CreditCard, LifeBuoy, LockKeyhole, Mail, MailQuestion, UserRoundCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PolicyPageShell, PolicySection, SUPPORT_EMAIL } from "@/components/PolicyPageShell";

/**
 * /support — Support & contact.
 *
 * One primary action (email support with a pre-filled subject) plus
 * self-serve routes to the in-product screens that already resolve the
 * most common questions, so the inbox only receives what a human must do.
 */
const selfServe: Array<{ icon: LucideIcon; title: string; body: string; href: string; cta: string }> = [
  { icon: CreditCard, title: "A payment didn’t add credits", body: "Buy credits re-checks the last payment with the provider and shows whether it was credited or is under review.", href: "/premium", cta: "Re-check payment" },
  { icon: MailQuestion, title: "Where is my referral request?", body: "My requests shows every request with its status history — sent, claimed, decided — and lets you withdraw while it is unclaimed.", href: "/requests", cta: "Open My requests" },
  { icon: UserRoundCheck, title: "My work email won’t verify", body: "Referrers verify with a one-time code sent to a company address. Personal domains are not accepted; you can re-send the code from Settings.", href: "/settings", cta: "Open Settings" },
  { icon: LockKeyhole, title: "Export or delete my data", body: "Settings gives you a copy of your personal data and lets you request account deletion review. Requests are actioned by an administrator, not silently.", href: "/settings", cta: "Privacy controls" },
];

const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("skipwait.me support request")}&body=${encodeURIComponent("Account email:\nWhat happened:\nReference (Ref-, payment id, or link), if any:\n")}`;

export default function Support() {
  return <PolicyPageShell
    screen="support"
    icon={LifeBuoy}
    eyebrow="Support"
    title="A person answers. Usually within one business day."
    intro="Most questions are answered by a screen you already have access to. Anything about money, verification, or your data reaches an administrator directly."
    updated="September 5, 2026"
    status="published"
    footnote="We never ask for passwords, one-time codes, or card numbers by email. Anything asking for those is not from us."
  >
    <section aria-label="Contact support" className="rounded-2xl border border-[#DBEAFE] bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#E8F0FE] text-[#191713]"><Mail className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-[#191713]">Email support</h2>
          <p className="mt-1 text-sm leading-6 text-[#625D52]">Write from the email on your account and include a reference (Ref-0007, a payment id, or the link you opened). We reply from <span className="font-semibold text-[#2E2B25]">{SUPPORT_EMAIL}</span>.</p>
          <a href={mailto} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#191713] px-5 py-3 text-sm font-bold text-white hover:bg-[#2A2721] sm:w-auto">Email {SUPPORT_EMAIL} <ArrowRight className="h-4 w-4" /></a>
          <p className="mt-3 text-xs leading-5 text-[#625D52]">Response target: one business day (Mon–Fri, IST). Payment and account-safety issues are handled first.</p>
        </div>
      </div>
    </section>

    <section aria-label="Solve it yourself" className="grid gap-3 sm:grid-cols-2">
      {selfServe.map(({ icon: Icon, title, body, href, cta }) => <article key={title} className="flex flex-col rounded-2xl border border-[#E2DDD2] bg-white p-5 shadow-sm">
        <Icon className="h-5 w-5 text-[#191713]" />
        <h3 className="mt-4 text-base font-semibold text-[#191713]">{title}</h3>
        <p className="mt-2 flex-1 text-sm leading-6 text-[#625D52]">{body}</p>
        <Link href={href} className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm font-bold text-[#191713]">{cta} <ArrowRight className="h-4 w-4" /></Link>
      </article>)}
    </section>

    <PolicySection number="01" title="What to include">
      <ul>
        <li><strong>Referral questions:</strong> the Ref- number from My requests or your inbox. Never paste a resume or another person’s details into an email.</li>
        <li><strong>Payment questions:</strong> the provider (Razorpay or PayPal), the amount, the date, and the receipt or transaction id. See the <Link href="/refunds" className="font-semibold text-[#191713]">Refunds & cancellation policy</Link> for what to expect.</li>
        <li><strong>Referrer verification:</strong> the company domain you tried and roughly when. Do not send the one-time code itself.</li>
      </ul>
    </PolicySection>

    <PolicySection number="02" title="Reporting misuse or a security concern">
      <p>If a request, message, or link looks fraudulent, or you believe someone accessed your account, email us with “Security” in the subject line. These are triaged ahead of everything else, and the affected request or link can be paused while we look.</p>
    </PolicySection>

    <PolicySection number="03" title="Status of an existing request">
      <p>Privacy requests (data export, deletion) and payment reviews appear with their current status inside <Link href="/settings" className="font-semibold text-[#191713]">Settings</Link> and <Link href="/premium" className="font-semibold text-[#191713]">Buy credits</Link>. You will also receive an in-product notification when an administrator decides.</p>
    </PolicySection>
  </PolicyPageShell>;
}
