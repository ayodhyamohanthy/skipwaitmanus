import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/privacy")({
  head: () => pageMeta("Privacy policy", "What SkipWait collects, why, who sees it, and how to download or delete your data. Private by default."),
  component: () => <LegalPage eyebrow="PRIVACY POLICY" title="Privacy" updated="6 Oct 2026" summary={["Your resume and name are hidden until a referrer accepts your ask.", "We store a one-way fingerprint of work emails — never show them.", "We don't sell your data or show ads.", "Download or delete everything from Settings at any time."]} sections={[
    { id: "collect", title: "What we collect", body: ["Account details (name, email, sign-in method), profile and work you add, asks and messages, and payment receipts (card details stay with our payment provider).", "Basic device and usage data to keep the service secure and working."] },
    { id: "why", title: "Why we use it", body: ["To match asks with verified referrers, deliver messages and notifications, process payments, prevent abuse, and improve the product. We use AI tools only on content you send to them."] },
    { id: "who", title: "Who can see what", body: ["Referrers see your role, note and pinned work. Your name, resume and contact appear only after they accept.", "Seekers see a referrer's company and function. Their name appears only after acceptance.", "Public profiles are visible according to the setting you choose: public, link only, or private."] },
    { id: "verification", title: "Work-email verification", body: ["We send a one-time code to prove you can receive email at your company. We keep a one-way fingerprint, the company, and the date — not the address or the code."] },
    { id: "rights", title: "Your rights", body: ["Access, correct, export, or delete your data from Settings. Depending on where you live (for example under GDPR or India's DPDP Act) you may have further rights; contact us to use them."] },
    { id: "retention", title: "How long we keep it", body: ["While your account is open. After deletion, data is erased within 30 days, except records we must keep by law, such as payment records."] },
    { id: "transfers", title: "International transfers", body: ["SkipWait is global. Data may be processed in other countries with safeguards required by law."] },
  ]} />,
});
