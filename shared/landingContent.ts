/**
 * Public landing copy with one typed source of truth.
 *
 * The build step (@scripts/prerender-public-pages.tsx) writes these strings
 * into the crawler-visible HTML snapshot, and the React landing page
 * (@client/src/pages/LaunchHome.tsx) renders the same values. A single source
 * is what stops the no-JavaScript HTML that search engines and payment-provider
 * reviewers read from drifting away from the page a visitor actually sees.
 *
 * Kit v4 rewrite (owner direction: v4 is the product, the old screens are
 * replaced). This file was the last place still carrying the pre-v4 landing
 * copy, which is why the homepage kept looking old after the React page was
 * replaced: the prerendered snapshot and the SEO metadata both read from here.
 *
 * Nothing here may state an outcome, count, or identity that the product does
 * not produce itself. Note that no string here names a plan or a price — the
 * pre-v4 copy quoted "$1 each (₹99 in India)", and the plan set is still
 * undecided.
 */

export type LandingStep = { title: string; body: string };
export type LandingLink = { href: string; label: string; summary: string };

export const LANDING_TITLE = "Free job referrals. A warmer way in";
export const LANDING_H1 = "Free job referrals. A warmer way in.";
export const LANDING_SUMMARY = "Connect with people inside the companies you want to join. A real introduction. Not another application into the unknown.";

/** The three steps on the homepage, in order. */
export const LANDING_SEEKER_STEPS: readonly LandingStep[] = [
  { title: "Find a company", body: "Explore companies where people are open to referral requests." },
  { title: "Make an ask", body: "Link one real role and explain, briefly, why you fit." },
  { title: "Meet someone inside", body: "A verified employee reviews it and chooses whether to help." },
];

/** What a referrer is promised, from the referrer band. */
export const LANDING_EMPLOYEE_STEPS: readonly LandingStep[] = [
  { title: "You choose every connection", body: "Passing is private and always okay." },
  { title: "Your name is never public", body: "It is shared only after you accept a request." },
  { title: "No money changes hands", body: "A thank-you note is the only acceptable reward." },
];

/** The trust strip under the hero. */
export const LANDING_COMMITMENTS: readonly LandingStep[] = [
  { title: "No referral fees.", body: "No payments between seekers and referrers, no commission, no paid priority." },
  { title: "Private by default.", body: "Resumes stay private until a referrer accepts your request." },
  { title: "No job guarantees.", body: "A referral is an introduction. Employers decide who to interview and hire." },
];

/** Every destination the homepage links to. Kit v4 routes only. */
export const LANDING_EXPLORE: readonly LandingLink[] = [
  { href: "/explore", label: "Explore companies", summary: "Companies where people are open to referral requests." },
  { href: "/referrer", label: "For referrers", summary: "Choose who you help and keep your identity private." },
  { href: "/safety", label: "Help & safety", summary: "How privacy, verification and reporting work." },
  { href: "/help", label: "Help centre", summary: "Answers about asking, referring, plans and safety." },
  { href: "/guidelines", label: "Community guidelines", summary: "The rules both sides agree to." },
  { href: "/terms", label: "Terms of service", summary: "What skipwait.me does and what it will never promise." },
  { href: "/privacy", label: "Privacy", summary: "What is collected, and what is never shared." },
];

/**
 * Employer pitch from the footer. It lives here, not inline in the page,
 * because the crawler-visible snapshot has to carry it too: a route linked from
 * the rendered page but not from the no-JavaScript HTML is an orphan, because
 * that HTML is the only copy a search engine reads.
 */
export const LANDING_EMPLOYER_LINK: LandingLink = {
  href: "/for-companies",
  label: "Hiring for your company?",
  summary: "Turn your employees' referrals into a trusted hiring channel — candidates never pay.",
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

export const LANDING_FAQ_HEADING = "A few good questions.";

/**
 * Questions the product can answer without a promise. These render as visible
 * page copy and as FAQ structured data, so the structured data never describes
 * something a visitor cannot read. Deliberately free of plan names and prices.
 */
export const LANDING_FAQ: readonly { question: string; answer: string }[] = [
  { question: "Are job referrals really free?", answer: "Yes. No payments between seekers and referrers, no referral commission, and no paid priority. A referral is a voluntary introduction, not a purchase." },
  { question: "Do I need to know someone at the company?", answer: "No existing connection is required. Explore companies with available referrers, find a relevant role, and send a thoughtful request. Each referrer chooses which requests to accept." },
  { question: "What does verification mean?", answer: "Work-email verification confirms ownership of an address on an approved company domain. It does not prove current employment or imply an employer's endorsement." },
  { question: "Does a referral guarantee an interview?", answer: "No. A referral is an introduction, not a promise. Employers independently decide who to interview and hire." },
];
