/**
 * Public landing copy with one typed source of truth.
 *
 * The build step (@scripts/prerender-public-pages.tsx) writes these strings
 * into the crawler-visible HTML snapshot, and the React landing page
 * (@client/src/pages/Home.tsx) renders the same values. A single source is what
 * stops the no-JavaScript HTML that search engines and payment-provider
 * reviewers read from drifting away from the page a visitor actually sees.
 *
 * Nothing here may state an outcome, count, or identity that the product does
 * not produce itself.
 */
import { FREE_PLAN } from "./planCatalog";

export type LandingStep = { title: string; body: string };
export type LandingLink = { href: string; label: string; summary: string };

export const LANDING_TITLE = "Private job referrals from verified employees";
/** The hero headline, one line per row; the page breaks between them and adds the brand dot after the last. */
export const LANDING_H1_LINES = ["Free job referrals.", "A warmer way in"] as const;
export const LANDING_H1 = `${LANDING_H1_LINES[0]} ${LANDING_H1_LINES[1]}.`;
/** The hero paragraph, one sentence group per row (the page breaks between them on wide screens). */
export const LANDING_HERO_LEAD_PARTS = ["Connect with people inside the companies you want to join.", "A real introduction. Not another application into the unknown."] as const;
export const LANDING_HERO_LEAD = LANDING_HERO_LEAD_PARTS.join(" ");
/** What the free plan gives, in the terms the product enforces today: open request slots, no credit needed to send. */
export const LANDING_FREE_SLOTS = `The free plan keeps up to ${FREE_PLAN.openRequests} requests open at once, and you do not need credits to send one.`;
export const LANDING_SUMMARY = `Paste the role link, add your resume, and verified employees at that company decide privately whether to refer you. Free plan: ${FREE_PLAN.openRequests} requests open at once.`;

export const LANDING_SEEKER_STEPS: readonly LandingStep[] = [
  { title: "Start with the role", body: "Paste the job link for the company you want to join." },
  { title: "Add your context", body: "Your resume and a short note about your fit." },
  { title: "Let the right people review", body: "Only verified employees of that company can review your request." },
];

export const LANDING_EMPLOYEE_STEPS: readonly LandingStep[] = [
  { title: "Verify your work email", body: "Get access to private requests for your company." },
  { title: "Review the whole picture", body: "The role, resume, and the candidate’s note, together." },
  { title: "Choose how to help", body: "Refer someone when it feels right. You can always pass." },
];

export const LANDING_COMMITMENTS: readonly LandingStep[] = [
  { title: "People, not a public feed.", body: "Your request is reviewed privately by verified employees at the target company." },
  { title: "An introduction. Not a guarantee.", body: "Employees decide whether to help. A referral never guarantees an interview or a job." },
];

export const LANDING_EXPLORE: readonly LandingLink[] = [
  { href: "/explore", label: "Explore companies", summary: "Start with a company. We’ll help you make a thoughtful ask." },
  { href: "/jobs", label: "Browse roles", summary: "Published roles worth a referral." },
  { href: "/wall", label: "Internal openings", summary: "Hiring signals shared privately by verified employees." },
  { href: "/referrer", label: "For employees", summary: "Verify your work email to review private requests at your company." },
  { href: "/premium", label: "Buy credits", summary: "Extra referral credits cost $1 each and never expire." },
  { href: "/pricing", label: "Pricing", summary: "The free monthly allowance, extra credits, and monthly plans." },
  { href: "/plans", label: "Monthly plans", summary: "Pro and Max add credits every month on top of the free allowance." },
  { href: "/about", label: "About us", summary: "Who runs skipwait.me and what it sells." },
  { href: "/contact", label: "Contact us", summary: "Reach the team about your account, a payment, or privacy." },
  { href: "/support", label: "Support", summary: "A person answers, usually within one business day." },
];

/**
 * Employer pitch from the footer. It lives here, not inline in Home.tsx, because
 * the crawler-visible snapshot has to carry it too: /employer had a link in the
 * rendered page and none in the no-JavaScript HTML, which is the only copy a
 * search engine reads. A route linked from nowhere else is an orphan.
 */
export const LANDING_EMPLOYER_LINK: LandingLink = {
  href: "/employer",
  label: "Hiring for your company?",
  summary: "Sponsor a role to opt-in seekers and unlock anonymized opt-in talent.",
};

/**
 * The public guides, linked from the home page. Copy lives in
 * @client/src/content/guides; this is only the entry point, so a visitor and a
 * crawler reach the same three pages.
 */
export const LANDING_GUIDES: readonly LandingLink[] = [
  { href: "/job-referral-platforms", label: "What a job referral platform is", summary: "The three models, how each charges, and what a referral changes." },
  { href: "/choosing-a-job-referral-platform", label: "Choosing one", summary: "Four checks, five red flags, and a shortlist template." },
  { href: "/how-employees-refer-candidates", label: "How referrals actually happen", summary: "What the employee reads, and what comes back to you." },
];

export const LANDING_FAQ_HEADING = "Common questions, answered plainly.";

/**
 * Questions the product can answer without a promise. These render as visible
 * page copy and as FAQ structured data, so the structured data never describes
 * something a visitor cannot read.
 */
export const LANDING_FAQ: readonly { question: string; answer: string }[] = [
  { question: "Is skipwait.me a public job board?", answer: "No. A referral request is visible only to verified employees at the company behind the role link you paste, and your resume stays private." },
  { question: "Who can review my request?", answer: "Only employees who verified a company email at that employer. They see the role, your resume, and your short note — never your contact details." },
  { question: "What does it cost?", answer: `${LANDING_FREE_SLOTS} Extra credits cost $1 each (₹99 in India), never expire, and are spent once a verified employee picks up your request; withdrawn or expired asks get the credit back.` },
  { question: "Does a referral guarantee an interview?", answer: "No. Employees choose whether to help, and a referral never guarantees an interview, an offer, or a job. You can withdraw an unclaimed request at any time." },
];
