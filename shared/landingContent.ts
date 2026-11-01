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
import { CREDIT_RULE, MONEY_SENTENCE, MONEY_SENTENCE_SHORT, PAID_PLANS_SENTENCE, REFERRING_FREE_LINE } from "./moneyCopy";
import { CREDIT_PACKS_ON_SALE, firstPackClaim } from "./planCatalog";

/** The first-pack claim, from the catalog the server sells (POSTMERGE-oct22 #534). */
const FIRST_PACK_INR = firstPackClaim("INR") ?? "our smallest pack";
const FIRST_PACK_USD = firstPackClaim("USD") ?? "our smallest pack";

export type LandingStep = { title: string; body: string };
export type LandingLink = { href: string; label: string; summary: string };

export const LANDING_TITLE = "Private job referrals from verified employees";
/**
 * The hero headline, one line per row; the page breaks between them and adds the brand dot after the last.
 * D-063: asking is free only for a monthly allowance, so the headline never says "free".
 */
export const LANDING_H1_LINES = ["Private job referrals.", "A warmer way in"] as const;
export const LANDING_H1 = `${LANDING_H1_LINES[0]} ${LANDING_H1_LINES[1]}.`;
/** The hero paragraph, one sentence group per row (the page breaks between them on wide screens). */
export const LANDING_HERO_LEAD_PARTS = ["Connect with people inside the companies you want to join.", "A real introduction. Not another application into the unknown."] as const;
export const LANDING_HERO_LEAD = LANDING_HERO_LEAD_PARTS.join(" ");
/** The search snippet (160 characters at most): how it works, then both money facts (D-063). */
export const LANDING_SUMMARY = `Paste a role link; verified employees decide privately whether to refer you. ${MONEY_SENTENCE_SHORT}`;

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
  ...(CREDIT_PACKS_ON_SALE
    ? [{ href: "/premium", label: "Buy credits", summary: "Extra referral credits are sold in one-time packs that never expire." }]
    : [{ href: "/premium", label: "Credit packs", summary: "Credit packs are paused while we update our plans." }]),
  { href: "/pricing", label: "Pricing", summary: "The free monthly allowance, extra credits, and what a credit buys." },
  { href: "/plans", label: "Plans and credits", summary: PAID_PLANS_SENTENCE },
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
  { question: "What does it cost?", answer: `${MONEY_SENTENCE} Extra credits are sold in one-time packs (from ${FIRST_PACK_INR} in India, ${FIRST_PACK_USD} elsewhere) and never expire. ${CREDIT_RULE}` },
  { question: "Does a referral guarantee an interview?", answer: "No. Employees choose whether to help, and a referral never guarantees an interview, an offer, or a job. You can withdraw an unclaimed request at any time." },
];

/**
 * Goal landing (V9, D-131/D-150): the copy the released landing renders.
 * The static public snapshot must show THIS current design, never the pre-goal
 * landing (D-048-fix-landing-load-flash): on a slow or blocked bundle the
 * reveal failsafe paints the snapshot, and painting the old design is the bug.
 */
export const GOAL_LANDING_H1 = "Nobody reads the pile.";
export const GOAL_LANDING_HERO_LEAD = "Mass applications meet software, not people. Here, one verified employee at the company you want to join reads your ask - and can open a private conversation. No commissions, no outcome promises.";
export const GOAL_LANDING_QUOTE_LEAD = "A referral is an introduction,";
export const GOAL_LANDING_QUOTE_REST = "never a promise of an interview or a job.";
export const GOAL_LANDING_QUOTE = `${GOAL_LANDING_QUOTE_LEAD} ${GOAL_LANDING_QUOTE_REST}`;
export const GOAL_LANDING_EMPLOYEE_H2 = "Be the way in for someone good.";
export const GOAL_LANDING_EMPLOYEE_LEAD = "Review asks when it feels right and open a door you believe in. Referring is always free - and referrers are never paid, so every yes stays genuine.";
export const GOAL_LANDING_EXPLORE_NOTE = "Explore before signing in.";
export const GOAL_LANDING_BAND_H2 = "Past the pile, into a conversation.";
export const GOAL_LANDING_BAND_LEAD = "A verified employee inside the company picks your ask and opens a private conversation - so you arrive as a person, not one more application in the pile.";
export const GOAL_LANDING_COMPARE_H2 = "Mass applying vs a referral.";
export const GOAL_LANDING_COMPARE_ROWS: ReadonlyArray<readonly [label: string, mass: string, referral: string]> = [
  ["Where you land", "One more application in a pile, screened by software before any person.", "One ask, read by a verified employee inside the company."],
  ["Your effort", "The same form, re-filled for every posting, hearing nothing back.", "One thoughtful ask with your resume and a short note - not another form."],
  ["Your wait", "39-55 days average hiring time for job-board and career-site candidates.", "About 29 days average hiring time for referred candidates."],
  ["Your odds", "One of every applicant in the pile.", "Referrals are about 7% of candidates and convert at nearly 40%."],
];
export const GOAL_LANDING_FIGURES_TEXT = "Figures: Jobvite, “4 Reasons to Invest in Employee Referrals” - jobvite.com - Employer-side averages, not a promise for any one person.";
export const GOAL_LANDING_FIGURES_HREF = "https://www.jobvite.com/blog/4-reasons-to-invest-in-employee-referrals/";
export const GOAL_LANDING_STEPS_H2 = "Three steps. No noise.";
export const GOAL_LANDING_TRUST_H2_PARTS: readonly [string, string] = ["Real insiders.", "Real rules."];
export const GOAL_LANDING_TRUST_H2 = GOAL_LANDING_TRUST_H2_PARTS.join(" ");
export const GOAL_LANDING_FAIR_H2 = "What never changes";

/** The three hero steps the goal landing renders; the cost body follows the D-132 flag. */
export function goalLandingSteps(costCopy: { stepBody: string }): Array<{ title: string; body: string }> {
  return [
    { title: "Pick where you want in", body: "See the companies with verified employees inside, and the roles you can ask about." },
    { title: "Ask with the cost up front", body: costCopy.stepBody },
    { title: "A yes opens a conversation", body: "An accepted ask opens a private conversation. A referral is an introduction, never a promise of an interview or a job." },
  ];
}

/** The trust cards; the spend wording follows the D-132 flag. */
export function goalLandingTrust(costCopy: { waitBody: string }): Array<{ title: string; body: string; blue: boolean }> {
  return [
    { title: "A real insider reads you", body: "Every referrer proves their company email before they can see a single ask.", blue: true },
    { title: "Private until it counts", body: "Your name stays private until a referrer chooses to open the conversation.", blue: false },
    { title: "Nothing spent while it waits", body: costCopy.waitBody, blue: false },
  ];
}

/** The "What never changes" list; the cost rule follows the D-132 flag. */
export function goalLandingFairRules(costCopy: { fairRule: string }): string[] {
  return [
    REFERRING_FREE_LINE,
    costCopy.fairRule,
    "No outcome promises: a referral is an introduction, not an interview or a job.",
    "Private by default: your name stays hidden until a referrer accepts.",
  ];
}

/** The goal landing's footer columns (V9 and the prerendered snapshot share them). */
export const GOAL_FOOTER_COLS: Array<{ title: string; links: Array<[string, string]> }> = [
  { title: "Product", links: [["/explore", "Explore companies"], ["/jobs", "Browse roles"], ["/pricing", "Pricing"], ["/plans", "Plans"]] },
  { title: "People", links: [["/referrer", "Join as a referrer"], ["/help", "Help"], ["/contact", "Contact"]] },
  { title: "Legal", links: [["/terms", "Terms"], ["/privacy", "Privacy"], ["/refunds", "Refunds"], ["/cancellations", "Cancellation"]] },
];
