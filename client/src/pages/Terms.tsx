import { Link } from "wouter";
import { ScrollText } from "lucide-react";
import { PolicyPageShell, PolicySection, SUPPORT_EMAIL } from "@/components/PolicyPageShell";

/**
 * /terms — Terms of Service.
 *
 * Every clause here restates behaviour the product already enforces (credit
 * accounting, one-referrer-per-request, private conversations, admin
 * review). Nothing is promised that the code does not do. Marked draft
 * until the founder/legal review in docs/pre-launch-checklist.md signs off.
 */
export default function Terms() {
  return <PolicyPageShell
    screen="terms"
    icon={ScrollText}
    eyebrow="TERMS OF SERVICE"
    title="Terms"
    intro=""
    updated="6 Oct 2026"
    status="published"
    sections={[
      { id: "who", label: "Who can use SkipWait" },
      { id: "referrals", label: "Referrals" },
      { id: "paid", label: "Plans, credits and payments" },
      { id: "content", label: "Your content" },
      { id: "conduct", label: "Conduct" },
      { id: "liability", label: "No guarantees" },
      { id: "changes", label: "Changes and contact" },
    ]}
  >
    <section aria-label="Short version" className="rounded-2xl bg-[#f5f5f5] p-5 sm:p-6">
      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-black">The short version</p>
      <ul className="mt-3 space-y-1.5 pl-5 text-sm leading-6 text-[#505050] [&_li]:list-disc [&_strong]:text-black">
        <li>Asking for and giving referrals is free. Always.</li>
        <li>Paid plans and credits buy preparation tools — never queue position or acceptance.</li>
        <li>Referrers decide freely. Companies decide hiring. We do not promise an interview, an offer, or any hiring outcome.</li>
        <li>Be honest about who you are and where you work.</li>
      </ul>
    </section>

    <PolicySection number="1" title="Who can use SkipWait">
      <p>You must be at least 18 and legally able to work or seek work where you live.</p>
      <p>One account per person. Referrers must verify a current work email for each company they refer into.</p>
    </PolicySection>

    <PolicySection number="2" title="Referrals">
      <p>A referral is a referrer's personal recommendation through their employer's own process. SkipWait is not the employer, recruiter, or agent.</p>
      <p>Nobody may request, offer, or accept money, gifts, or favours in exchange for a referral. Doing so ends your account.</p>
    </PolicySection>

    <PolicySection number="3" title="Plans, credits and payments">
      <p>Every Job Seeker account includes 3 free referral credits each month.</p>
      <p>Plans renew monthly or yearly until cancelled. Cancelling stops the next renewal; you keep access until the period ends.</p>
      <p>Purchased credits don't expire. Plan credits roll over as described on the Plans page. Credits have no cash value.</p>
      <p>Paying never changes queue order, visibility to referrers, or a referrer's decision.</p>
    </PolicySection>

    <PolicySection number="4" title="Your content">
      <p>You own what you upload. You let us store and show it only to the people you choose, to run the service.</p>
      <p>Don't upload anything you don't have the right to share, including confidential employer material.</p>
    </PolicySection>

    <PolicySection number="5" title="Conduct">
      <p>Follow the Community Guidelines. We may warn, restrict, or remove accounts that break them, and you can appeal within 14 days.</p>
    </PolicySection>

    <PolicySection number="6" title="No guarantees">
      <p>SkipWait is provided as is. We aren't responsible for hiring decisions, a referrer's actions, or third-party job postings.</p>
    </PolicySection>

    <PolicySection number="7" title="Changes and contact">
      <p>We'll tell you about material changes at least 14 days before they apply.</p>
      <p className="mt-4 text-sm text-muted-foreground">Questions? Write to <strong className="text-foreground">hello@skipwait.me</strong> (placeholder address).</p>
    </PolicySection>

  </PolicyPageShell>;
}
