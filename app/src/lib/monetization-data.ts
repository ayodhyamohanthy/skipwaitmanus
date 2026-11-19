// Design-preview data. All prices are EXAMPLE values for review, not final pricing.
export const fairnessRules = [
  "Asking for a referral is free, forever.",
  "Paying never moves you up a referrer's queue.",
  "Referrers never see who has a paid plan.",
  "No commissions on hires. No paid priority.",
];

export const seekerPlans = [
  {
    id: "go", name: "Start", price: "$8", yearly: "$80", cadence: "per month", tagline: "For a focused search: more room on the tools you use every day.",
    features: ["Everything in Free", "10 credits included every month", "Unused credits carry over 1 month", "Higher ask-coach limits — sharpen every note you send", "More uploads and saved context per role", "8 open referral requests at once (Free: 3)", "Company-opening alerts — know when a door opens", "10 showcase pieces, 3 pinned"],
    cta: "Upgrade to Start",
  },
  {
    id: "plus", name: "Momentum", price: "$20", yearly: "$200", cadence: "per month", tagline: "For interviews you can see coming: deep research and tailored prep.", featured: true,
    features: ["Everything in Start", "30 credits included every month", "Unused credits carry over up to 3 months", "Advanced role and company research before you ask", "Tailored interview prep for the exact role", "15 open referral requests at once", "Unlimited showcase, 6 pinned pieces", "Custom profile link and private insights"],
    cta: "Upgrade to Momentum",
  },
  {
    id: "pro", name: "Land", price: "$100", yearly: "$1,000", cadence: "per month", tagline: "For a search that is your full-time job: maximum tools and hands-on support.",
    features: ["Everything in Momentum", "120+ credits every month — up to 1,000 on Concierge", "Unused credits roll over while you're subscribed", "30 open referral requests at once — more on higher Land levels", "Highest research and preparation limits", "Multi-step job-search workflows that run for you", "Cross-role application planning", "Priority human support", "Sign in, connect and apply from ChatGPT, Claude, bots & your own tools (you approve every send)"],
    cta: "Upgrade to Land",
  },
] as const;

export const proLevels = [
  { id: "focus", price: "$100", yearly: "$1,000", label: "Focus", detail: "120 credits/month · 30 open requests. Credits roll over monthly. Maximum tools for one intensive search." },
  { id: "sprint", price: "$200", yearly: "$2,000", label: "Sprint", detail: "300 credits/month · 50 open requests across several roles or markets. Credits roll over monthly." },
  { id: "concierge", price: "$500+", yearly: "$5,000+", label: "Concierge", detail: "1,000 credits/month · unlimited open requests, credits roll over, tailored limits and hands-on support." },
] as const;

// 1 credit = $1 = one unit of finished work. Everyone gets 3 free credits.
export const creditPacks = [
  { id: "c5", credits: 5, price: "$5", usd: "$1.00 each", note: "Try a tool" },
  { id: "c25", credits: 25, price: "$22", usd: "Save 12%", note: "Most chosen", featured: true },
  { id: "c60", credits: 60, price: "$48", usd: "Save 20%", note: "Active search" },
  { id: "c150", credits: 150, price: "$105", usd: "Save 30%", note: "Best value" },
] as const;

export const creditActions = [
  { action: "Ask coach rewrite", cost: 1, detail: "Sharpen one referral note for one job link." },
  { action: "Profile strength check", cost: 1, detail: "See your profile the way a referrer will." },
  { action: "Company research report", cost: 3, detail: "One deep brief on a company and team." },
  { action: "Resume overhaul", cost: 3, detail: "Tailored rewrite for one target role." },
  { action: "Mock interview session", cost: 5, detail: "Role-specific practice with feedback." },
  { action: "Extra request slot (30 days)", cost: 2, detail: "One more active ask. Same queue, same rules." },
] as const;

export const signatureTools = [
  { id: "onepager", name: "Ask One-Pager", cost: 2, plan: "Start", output: "A tailored PDF brief", detail: "Who you are, why this company, the exact role link — attached to every ask so referrers say yes faster to read." },
  { id: "salary", name: "Salary & negotiation coach", cost: 5, plan: "Momentum", output: "Your number + a script", detail: "Market range for the role and city, your target, and word-for-word replies for the offer call." },
  { id: "review", name: "Human expert review", cost: 25, plan: "Land", output: "Written feedback in 48h", detail: "A recruiter or hiring manager reviews your resume and profile for one target role." },
  { id: "dossier", name: "Interview dossier", cost: 4, plan: "Momentum", output: "A printable prep pack", detail: "Likely questions, team context and stories from your work mapped to the role." },
  { id: "offer", name: "Offer comparison", cost: 3, plan: "Momentum", output: "A side-by-side verdict", detail: "Compare up to three offers on pay, growth and risk in plain language." },
  { id: "pack", name: "Thank-you & follow-up pack", cost: 1, plan: "Start", output: "Ready-to-send notes", detail: "Polite follow-ups and thank-you notes for referrers and interviewers." },
] as const;

export const companyPlans = [
  { name: "Company page", price: "Free", detail: "Claim your page, add a verified team badge and culture showcase." },
  { name: "Referral programme", price: "From $199/mo", detail: "See which roles people ask about, route employee referrals to your hiring team, run campaigns.", featured: true },
  { name: "Enterprise", price: "Talk to us", detail: "SSO, ATS integrations, multi-region teams, compliance reviews and a dedicated partner." },
] as const;

export const importSources = [
  { id: "github", name: "GitHub", kind: "Repositories & READMEs" },
  { id: "behance", name: "Behance", kind: "Projects & case studies" },
  { id: "dribbble", name: "Dribbble", kind: "Shots & collections" },
  { id: "medium", name: "Medium", kind: "Articles" },
  { id: "website", name: "Personal website", kind: "Any public page link" },
  { id: "linkedin", name: "LinkedIn export", kind: "Upload your data file" },
] as const;

export const workTypes = ["Project", "Case study", "Link", "File or image", "Write-up"] as const;
export type Visibility = "public" | "askers" | "private";
export const visibilityLabels: Record<Visibility, string> = { public: "Public", askers: "Only referrers I ask", private: "Only me" };
