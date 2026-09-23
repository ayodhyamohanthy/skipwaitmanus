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
import { FREE_MONTHLY_ALLOWANCE } from "./subscriptionPlans";

export type LandingStep = { title: string; body: string };
export type LandingLink = { href: string; label: string; summary: string };

export const LANDING_TITLE = "Private job referrals from verified employees";
export const LANDING_H1 = "Good work deserves a good introduction.";
export const LANDING_SUMMARY = `Paste the role link, add your resume, and verified employees at that company decide privately whether to refer you. ${FREE_MONTHLY_ALLOWANCE} referral requests are free every month.`;

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
  { href: "/jobs", label: "Browse roles", summary: "Published roles worth a referral." },
  { href: "/wall", label: "Internal openings", summary: "Hiring signals shared privately by verified employees." },
  { href: "/referrer", label: "For employees", summary: "Verify your work email to review private requests at your company." },
  { href: "/premium", label: "Buy credits", summary: "Extra referral credits cost $1 each and never expire." },
  { href: "/pricing", label: "Pricing", summary: "The free monthly allowance, extra credits, and monthly plans." },
  { href: "/about", label: "About us", summary: "Who runs skipwait.me and what it sells." },
  { href: "/contact", label: "Contact us", summary: "Reach the team about your account, a payment, or privacy." },
  { href: "/support", label: "Support", summary: "A person answers, usually within one business day." },
];
