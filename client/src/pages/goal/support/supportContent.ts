// Help and safety answers for the goal /help and /safety (D-048-p3-support).
// The kit pages keep their own copies (Help.tsx, Safety.tsx); the goal pages
// may not import a kit page file (goalPagesBoundary), so the answers are
// mirrored here word for word, and every money line is imported from
// shared/moneyCopy.ts, never retyped (D-063, D-134). A copy change to the kit
// answers ports here through the kit-drift check before release.
import { ASK_COST_SENTENCE, CREDIT_RULE, MONEY_SENTENCE, REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";
import { FREE_PLAN } from "@shared/planCatalog";

export const HELP_CATEGORIES = ["Asking", "Referring", "Plans & credits", "Account & privacy", "Safety"] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export interface HelpAnswer { category: HelpCategory; question: string; answer: string }

export const HELP_ANSWERS: ReadonlyArray<HelpAnswer> = [
  // D-063: the money sentence, then the credit rule exactly as the ledger keeps it.
  { category: "Asking", question: "Does asking for a referral cost anything?", answer: `${ASK_COST_SENTENCE} ${CREDIT_RULE} ${REFERRER_MONEY_SENTENCE}` },
  { category: "Asking", question: "How many asks can I have open?", answer: `Free: ${FREE_PLAN.openRequests} at a time. An answered, withdrawn or expired ask frees its slot.` },
  { category: "Asking", question: "Why did my ask expire?", answer: "If no referrer accepts within 7 days it closes automatically and your slot returns. Try refreshing your note." },
  { category: "Asking", question: "Does a referral guarantee an interview?", answer: "No. Referrers recommend; companies decide. We never promise outcomes." },
  { category: "Referring", question: "How do I become a referrer?", answer: "Verify your work email with a one-time code, then choose your job areas and monthly capacity." },
  { category: "Referring", question: "My company uses a different email domain.", answer: "Start verification anyway — unlisted domains go to a person for manual review." },
  { category: "Referring", question: "Will seekers see my name?", answer: "Only after you accept their ask. Passing is private." },
  { category: "Plans & credits", question: "Do credits expire?", answer: "Purchased credits never expire. Plan credits roll over based on your plan." },
  { category: "Plans & credits", question: "Does paying move me up the queue?", answer: "Never. Every ask is shown on equal terms." },
  { category: "Plans & credits", question: "How do I cancel?", answer: "Open Plans and manage your subscription there. You keep access until the period ends." },
  { category: "Account & privacy", question: "Who can see my resume?", answer: "Only a referrer who accepted your ask." },
  { category: "Account & privacy", question: "How do I delete my account?", answer: "Settings lets you download your data or request deletion review. We review requests rather than silently removing records." },
  { category: "Safety", question: "Someone asked me for money.", answer: "Don't pay. Contact support and we will review it confidentially." },
  { category: "Safety", question: "How do I block someone?", answer: "Contact support from any conversation and we will step in — including both-direction blocks where needed." },
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

// Report reasons (kit /report), the strings the server stores.
export const REPORT_REASONS: ReadonlyArray<readonly [reason: string, hint: string]> = [
  ["Asked for or offered money", "Referrers are never paid and never ask for money"],
  ["Harassment or inappropriate messages", ""],
  ["Fake job or scam", "Suspicious links, fees, or personal data requests"],
  ["Pretending to work at a company", ""],
  ["Spam or repeated asks", ""],
  ["Something else", ""],
];
