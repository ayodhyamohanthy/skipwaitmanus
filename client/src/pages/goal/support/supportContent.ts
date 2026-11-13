// Help and safety answers for the goal /help and /safety (D-048-p3-support).
// These answers are goal-owned copy. They started from the kit's Help.tsx and
// Safety.tsx answers (goalPagesBoundary keeps kit page files out of the goal
// pages), but they are no longer word-for-word kit copies: reviews 6563736305,
// 6565471121 and 6566372499 rewrote them, so they are deliberate goal-owned
// copy, not an automatic mirror of the kit.
// No automated or implemented kit-drift check exists in code: no test or CI job
// keeps these answers in step with the kit. The packet's
// manual kit-drift release check still applies at release
// (docs/plans/D-048-phase-3-split.md §6: `git log <surface landing
// SHA>..origin/main -- <kit page + its exclusive files>` must be empty or the
// change is ported first), and any kit change it finds is ported deliberately.
// That manual check, or any kit port, must not restore the removed
// operational promises (staff or
// "a person", manual review, review timing, outcome notification, stepping in),
// the instruction to open Report from the conversation and choose "Also block
// this person" (no product link opens Report with that toggle, review
// 6566372499), or any claim that support will block someone.
// Money lines follow D-173/D-180: every one with a shared/moneyCopy.ts export is
// imported, never retyped (D-063, D-134); "Do credits expire?" is mirrored kit
// money wording kept byte-identical (see the note on it below).
import { ASK_COST_SENTENCE, CREDIT_RULE, MONEY_SENTENCE, REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";
import { FREE_PLAN } from "@shared/planCatalog";

export const HELP_CATEGORIES = ["Asking", "Referring", "Plans & referrals", "Account & privacy", "Safety"] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export interface HelpAnswer { category: HelpCategory; question: string; answer: string }

export const HELP_ANSWERS: ReadonlyArray<HelpAnswer> = [
  // D-063: the money sentence, then the credit rule exactly as the ledger keeps it.
  { category: "Asking", question: "Does asking for a referral cost anything?", answer: `${ASK_COST_SENTENCE} ${CREDIT_RULE} ${REFERRER_MONEY_SENTENCE}` },
  { category: "Asking", question: "How many referral requests can I have open?", answer: `Free: ${FREE_PLAN.openRequests} at a time. An answered, withdrawn or expired referral request frees its slot.` },
  { category: "Asking", question: "Why did my referral request expire?", answer: "If no referrer accepts within 7 days it closes automatically and your slot returns. Try refreshing your note." },
  { category: "Asking", question: "Does a referral guarantee an interview?", answer: "No. Referrers recommend; companies decide. We never promise outcomes." },
  { category: "Referring", question: "How do I become a referrer?", answer: "Verify your work email with a one-time code, then choose your job areas and monthly capacity." },
  { category: "Referring", question: "My company uses a different email domain.", answer: "Contact support with your company name and work email domain." },
  { category: "Referring", question: "Will seekers see my name?", answer: "Only after you accept their referral request. Passing is private." },
  // Review 6565471121 (4): this question and its answer are retyped kit copy,
  // not imported from shared/moneyCopy, and both are money wording. D-173 keeps
  // money lines byte-identical until the D-132 audit, and D-180 freezes money
  // wording, so "credits" stays here; the rename belongs to the terminology
  // lane (PR 598) and the D-180 owner (PR 704), not this row.
  { category: "Plans & referrals", question: "Do credits expire?", answer: "Purchased credits never expire. Plan credits roll over based on your plan." },
  { category: "Plans & referrals", question: "Does paying move me up the queue?", answer: "Never. Every referral request is shown on equal terms." },
  { category: "Plans & referrals", question: "How do I cancel?", answer: "Open Plans and manage your subscription there. You keep access until the period ends." },
  { category: "Account & privacy", question: "Who can see my resume?", answer: "Only a referrer who accepted your referral request." },
  { category: "Account & privacy", question: "How do I delete my account?", answer: "Settings lets you download your data or request account deletion. A deletion request is recorded and its status shows in Settings; records are not removed instantly." },
  // Review 6566372499 follow-up: the conversation's Report link is a bare
  // /report that binds no thread or request, so this names a generic entry.
  { category: "Safety", question: "Someone asked me for money.", answer: "Don't pay. File a report from the Report page (the other person isn't told who reported them), or contact support." },
  // Review 6566372499: the conversation pages link to a bare /report, which has
  // no block toggle, so this answer neither sends people there for it nor says
  // support will block. It gives the path that exists: file, keep the
  // reference, contact support.
  { category: "Safety", question: "How do I block someone?", answer: "You can't block someone from Help. If Report doesn't offer “Also block this person”, file the report anyway, keep the reference it gives you, and contact support with that reference." },
];

export const HELP_POLICY_LINKS: ReadonlyArray<readonly [label: string, href: string]> = [
  ["Community guidelines", "/guidelines"],
  ["Terms of service", "/terms"],
  ["Privacy policy", "/privacy"],
  ["Safety", "/safety"],
];

// Safety answers (kit /safety). The pay answer links to the live Report flow,
// so it is rendered by the page with a link rather than kept as plain text.
export const SAFETY_ANSWERS: ReadonlyArray<readonly [question: string, answer: string]> = [
  ["What does asking for a referral cost?", `${MONEY_SENTENCE} There are no commissions and no paid priority: a referral is a voluntary introduction, not a purchase.`],
  ["Who can see a referrer’s name?", "Referrer names are not public. A name is revealed only to the seeker whose request that referrer has accepted."],
  ["Does a referral guarantee an interview?", "No. A referral, interview, offer, or job is never guaranteed. Employers make their own hiring decisions."],
  ["What does work-email verification mean?", "It confirms ownership of an email address on an approved company domain. It does not prove current employment or employer endorsement."],
  ["When is my resume shared?", "Resumes stay private until a referrer accepts a request."],
];
export const SAFETY_PAY_QUESTION = "What if someone asks me to pay?";

// Report reasons (kit /report). The label is what people read; the server
// stores the kit's reason string, so a label that differs maps back to that
// stored value byte for byte (REPORT_REASON_VALUES). D-180: public copy says
// "referral request", never the noun "ask"; the stored value is not renamed.
export const REPORT_REASONS: ReadonlyArray<readonly [label: string, hint: string]> = [
  ["Asked for or offered money", "Referrers are never paid and never ask for money"],
  ["Harassment or inappropriate messages", ""],
  ["Fake job or scam", "Suspicious links, fees, or personal data requests"],
  ["Pretending to work at a company", ""],
  ["Spam or repeated requests", ""],
  ["Something else", ""],
];

export const REPORT_REASON_VALUES: Readonly<Record<string, string>> = {
  "Spam or repeated requests": "Spam or repeated asks",
};
export const reportReasonValue = (label: string): string => REPORT_REASON_VALUES[label] ?? label;
