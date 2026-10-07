import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/terms")({
  head: () => pageMeta("Terms of service", "The rules for using SkipWait: free referrals, honest asks, paid tools for preparation, and no promises about hiring outcomes."),
  component: () => <LegalPage eyebrow="TERMS OF SERVICE" title="Terms" updated="6 Oct 2026" summary={["Asking for and giving referrals is free. Always.", "Paid plans and credits buy preparation tools — never queue position or acceptance.", "Referrers decide freely. Companies decide hiring. We don't promise jobs.", "Be honest about who you are and where you work."]} sections={[
    { id: "who", title: "Who can use SkipWait", body: ["You must be at least 18 and legally able to work or seek work where you live.", "One account per person. Referrers must verify a current work email for each company they refer into."] },
    { id: "referrals", title: "Referrals", body: ["A referral is a referrer's personal recommendation through their employer's own process. SkipWait is not the employer, recruiter, or agent.", "Nobody may request, offer, or accept money, gifts, or favours in exchange for a referral. Doing so ends your account."] },
    { id: "paid", title: "Plans, credits and payments", body: ["Plans renew monthly or yearly until cancelled. Cancelling stops the next renewal; you keep access until the period ends.", "Purchased credits don't expire. Plan credits roll over as described on the Plans page. Credits have no cash value.", "Paying never changes queue order, visibility to referrers, or a referrer's decision."] },
    { id: "content", title: "Your content", body: ["You own what you upload. You let us store and show it only to the people you choose, to run the service.", "Don't upload anything you don't have the right to share, including confidential employer material."] },
    { id: "conduct", title: "Conduct", body: ["Follow the Community Guidelines. We may warn, restrict, or remove accounts that break them, and you can appeal within 14 days."] },
    { id: "liability", title: "No guarantees", body: ["SkipWait is provided as is. We aren't responsible for hiring decisions, a referrer's actions, or third-party job postings."] },
    { id: "changes", title: "Changes and contact", body: ["We'll tell you about material changes at least 14 days before they apply."] },
  ]} />,
});
