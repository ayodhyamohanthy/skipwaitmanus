/**
 * Editorial content for the three public guide pages.
 *
 * These exist to answer questions a job seeker actually asks before they sign up
 * for anything: what the category is, how to compare services in it, and what
 * the employee on the inside is really doing. They follow three rules.
 *
 * 1. No competitor is named. A comparison page that lists other products has to
 *    be correct about them, and nothing here can verify what another service
 *    does with your resume.
 * 2. No number, price, or outcome appears unless this repository produces it.
 * 3. Where skipwait.me is mentioned, it is described the way the product is
 *    built, not the way it would market itself.
 *
 * Type, registry, and lookup live here; @client/src/pages/GuidePage renders
 * them. Titles, descriptions, and canonical URLs stay in @shared/publicRoutes.
 */

export type GuideSection = {
  readonly heading: string;
  readonly paragraphs: readonly string[];
  /** Rendered as a list under the paragraphs. */
  readonly points?: readonly string[];
};

export type Guide = {
  /** Canonical path. Must match an entry in @shared/publicRoutes. */
  readonly route: string;
  /** One line, used wherever another page points here. */
  readonly summary: string;
  /** One or two sentences under the H1. The page's opening claim. */
  readonly intro: string;
  readonly sections: readonly GuideSection[];
  /** Printed as visible questions *and* marked up as FAQPage. */
  readonly faq: readonly { readonly question: string; readonly answer: string }[];
};

const JOB_REFERRAL_PLATFORMS: Guide = {
  route: "/job-referral-platforms",
  summary: "What the category is, the three models behind it, and what a referral actually changes.",
  intro:
    "A job referral platform puts your application in front of someone who already works at the employer. That person decides whether to pass it on. This page explains the models that exist, what each one costs, and what a referral actually changes about your chances.",
  sections: [
    {
      heading: "The short definition",
      paragraphs: [
        "A job board shows you openings and takes your application. A referral platform does something different: it finds the people who already work at the company you want and gives one of them a way to vouch for you, privately, with your full application attached.",
        "The distinction matters because the two products fail differently. A job board fails when nobody reads your application. A referral platform fails when the person who would have vouched for you never worked there in the first place.",
      ],
    },
    {
      heading: "Three models you will run into",
      paragraphs: [
        "Every service in this category does one of three things. They look similar from the outside and differ on the single question that matters most: who sees your application, and when.",
      ],
      points: [
        "Direct submission. You apply normally, and the platform adds your name to a referral list inside the company. Your identity is usually visible to the employer immediately. This is fast and blunt: it works when the employee is genuinely willing to be associated with you, and it does nothing when they are not.",
        "Employee-mediated review. The employer does not see your application at all until an employee at that company chooses to forward it. Your identity is withheld unless they accept. This is the model that matters when you are not comfortable being one more name in an inbox, and it is the model where the platform's verification quality determines whether the whole thing works.",
        "Private talent pools. An employer hires from a pool of candidates who opted in, sometimes after a paid assessment. There is no referral from a specific person, so you are competing on a profile rather than on someone's judgement. This is a hiring pipeline rather than an introduction.",
      ],
    },
    {
      heading: "What every model needs in order to work",
      paragraphs: [
        "Strip away the features and three things have to be present. A service that is missing any of them is a listing site with a marketing budget.",
      ],
      points: [
        "A reviewer who provably works at the employer. Not claims a stranger made, not a profile picture, not a job title. Something tied to the company's email domain.",
        "A complete application. The employee needs the role, your resume, and enough context to judge fit. A name and a link is not a referral; it is an interruption.",
        "A human decision. Somebody has to choose to help. Any model that removes the choice and calls it a match has removed the only part that was valuable.",
      ],
    },
    {
      heading: "How these services usually charge",
      paragraphs: [
        "Four pricing shapes are common, and you can usually tell which one you are in from where the charge happens rather than how much it is.",
      ],
      points: [
        "Free allowance for seekers, with a cap. Usually a handful of referral requests a month, and no charge at all for the employee reviewing one.",
        "Per-referral credit, consumed on acceptance. The credit is reserved when you send a request and only spent when an employee accepts it. If a service charges on submission instead, that is the single most important thing to notice.",
        "Subscription for recurring volume. A monthly fee that includes a set number of credits, for people applying to many roles a month.",
        "Employer sponsorship. Companies pay to promote roles into seeker feeds. This costs a job seeker nothing, which is why it is the healthiest of the four from the seeker's side.",
      ],
    },
    {
      heading: "What a referral can and cannot do",
      paragraphs: [
        "A referral changes one thing: your application reaches a person who reads it, and that person has a reason to read it carefully. It does not change the job requirements, it does not shorten a process the employer runs on a schedule, and it does not create a role that is not budgeted.",
        "Treat any service that promises an interview as selling something it cannot deliver. The strongest available claim is that a referral materially improves the odds that a human reads your application, and that a careful, relevant application from someone who already knows the company beats a mass application with no introduction.",
      ],
    },
    {
      heading: "Questions worth asking before you sign up for anything",
      paragraphs: [
        "If a service cannot answer these clearly and in public, that is the answer.",
      ],
      points: [
        "Who reviews my request, and how do you know they work there?",
        "Exactly what does the reviewer see, and what do they not see?",
        "Does my employer find out I applied?",
        "When am I charged, and what happens to the money if nobody accepts?",
        "Can I withdraw a request nobody has claimed, and delete my resume?",
        "Who operates this, and where are they based?",
      ],
    },
  ],
  faq: [
    { question: "What is a job referral platform?", answer: "It is a service that connects a job seeker to an employee at the employer they are applying to, so that employee can pass the application on privately with their name on it." },
    { question: "Is a job referral platform the same as a job board?", answer: "No. A job board lists openings and takes your application. A referral platform routes that application to a specific person who already works at the company and lets them decide whether to pass it on." },
    { question: "Does a referral guarantee an interview?", answer: "No. The employee chooses whether to help, and the employer still runs its own process. A referral improves the chance that a human actually reads your application; it does not bypass the employer's requirements." },
    { question: "What does a job referral platform cost a job seeker?", answer: "Most offer a free monthly allowance. Where there is a charge, it is usually per referral request, and the important detail is whether it is consumed when you send the request or only when an employee accepts it." },
  ],
};

const CHOOSING_A_JOB_REFERRAL_PLATFORM: Guide = {
  route: "/choosing-a-job-referral-platform",
  summary: "Four checks, five red flags, and a shortlist template to fill in for each service.",
  intro:
    "The differences between these services are not usually in the pricing page. They are in four things you can check yourself in about ten minutes, without sending anyone your resume.",
  sections: [
    {
      heading: "Check 1: is the reviewer provably at the company?",
      paragraphs: [
        "This is the check that decides whether the product works at all. If the people reviewing your request are not tied to the employer's domain, then nobody is vouching for you and you have paid for a job board with extra steps.",
        "Three common approaches, in descending order of what they actually prove: a one-time code sent to a company email address, which ties a person to a domain; a LinkedIn connection, which proves a person once held a job somewhere and can be faked or stale; a self-declared employer and job title, which proves only that someone typed it.",
      ],
    },
    {
      heading: "Check 2: what is visible, and to whom?",
      paragraphs: [
        "The same product can either show your employer that you applied the moment you send it, or show them nothing until a reviewer accepts. Find out which one you are signing up for before you upload a resume.",
        "Three things to establish. Does your employer see your name and resume at submission, or only if a reviewer accepts? Does the reviewer see your email address and phone number, or only the work you have attached? And can other employees at that company browse requests meant for one specific team?",
      ],
    },
    {
      heading: "Check 3: when does money actually move?",
      paragraphs: [
        "Most of these services do not charge the same way, and the difference is entirely about timing.",
        "A credit reserved on submission and spent on acceptance behaves very differently from one spent on submission. If nobody ever accepts your requests, the second model has taken your money and given you nothing in return. Find out which one you are in, then check the refund window in writing, and check whether unused credits expire.",
      ],
    },
    {
      heading: "Check 4: can you take it back?",
      paragraphs: [
        "Before you upload a resume, find out what happens to it. Can you withdraw a request that nobody has claimed yet? Can you delete the document after sending it? Can you get a copy of what the service holds about you?",
        "A service that cannot delete your resume on request is telling you something about how it treats it after you leave.",
      ],
    },
    {
      heading: "Red flags",
      paragraphs: [
        "These are the patterns that show up in services that are not really doing the thing they describe.",
      ],
      points: [
        "A guaranteed interview, or a stated success rate for an individual application. Nobody can promise either.",
        "“Our employee will submit your application for you” with no company domain named anywhere.",
        "A price that is hard to find until you are already inside a checkout.",
        "No operator, no address, and no named person behind the company page.",
        "A model where your employer is told you applied, sold as a privacy feature.",
      ],
    },
    {
      heading: "A shortlist you can fill in",
      paragraphs: [
        "Write these five answers down for every service you are considering, side by side. The service with the clearest answers is almost always the one to try first, regardless of what it charges.",
      ],
      points: [
        "How is a reviewer tied to the employer?",
        "Does my employer see my application before someone accepts it?",
        "What exactly does a reviewer see?",
        "When is a credit consumed, and what is the refund window?",
        "Can I withdraw an unclaimed request and delete my resume?",
      ],
    },
  ],
  faq: [
    { question: "What should I check before signing up for a job referral platform?", answer: "Four things: how a reviewer is tied to the employer, whether the employer sees your application before someone accepts it, when a credit is actually consumed and what the refund window is, and whether you can withdraw an unclaimed request and delete your resume." },
    { question: "How do I tell if a referral service actually has employees at the company?", answer: "Look for verification tied to the employer's email domain, such as a one-time code sent to a work address. A LinkedIn connection or a self-declared job title does not prove the person currently works there." },
    { question: "Is it normal for a referral service to charge per request?", answer: "Yes. The detail that matters is timing: a credit reserved when you submit and only spent when an employee accepts is a different product from one spent at submission. Check the refund window before you start sending requests." },
  ],
};

const HOW_EMPLOYEES_REFER_CANDIDATES: Guide = {
  route: "/how-employees-refer-candidates",
  summary: "What the reviewer reads, how they decide, and what the employer and candidate end up with.",
  intro:
    "The employee side is the part most of these platforms never explain. Here is what happens between a person deciding to help and the candidate hearing anything back.",
  sections: [
    {
      heading: "Why an employee does this at all",
      paragraphs: [
        "Nobody refers a stranger out of duty. The motivations are ordinary and worth knowing, because the quality of the referral tracks the motivation almost exactly.",
      ],
      points: [
        "They have seen the work. The most reliable referrers are people who reviewed your resume, worked with you, or read something you wrote and could judge it themselves.",
        "They want to help a specific person. A colleague, a former mentee, someone whose interview they sat in on. This is the strongest reason and the hardest to buy.",
        "Someone is hiring on their team and they want good people in it. This is the most common reason in practice, and it is fine: a hiring manager still reviews the application and can still decline.",
        "It carries a small reward or is simply visible to be seen as helpful. This is the weakest reason, and it is the reason most referral incentives exist to address.",
      ],
    },
    {
      heading: "What the employee actually reads",
      paragraphs: [
        "Usually three things: the role, the resume, and a short note from you. That is it. Nobody is reading a cover letter, and nobody is going to reconstruct your career for you.",
        "This is worth internalising, because it changes what is worth writing. The note that works is short and specific about why you are applying for this role at this company. The note that gets ignored is a paragraph of adjectives with no claim in it. If you can say in two sentences what you have actually done and why it is relevant here, that is the whole job.",
      ],
    },
    {
      heading: "The decision itself",
      paragraphs: [
        "The reviewer has three options, and in practice they take all three over time: accept and pass your application on, ask you one question, or pass.",
        "A pass is not a judgement about your worth and is usually not about your resume. Most passes are about timing, band, location, or the fact that the team is not hiring that role this quarter. It is also the outcome that makes these systems honest: because passing is free and normal, the acceptances mean something.",
      ],
    },
    {
      heading: "What the employer sees",
      paragraphs: [
        "This varies by service and it is the detail to check before you apply. In some models the employer sees your name and resume the moment you submit. In others it sees nothing at all until an employee forwards it, and in others it sees an anonymised profile with the role attached.",
        "Employee-mediated review is the most private of the three and also the slowest, because a referral only moves when a person acts. If a role is urgent, the slower path is the wrong path, and no service will tell you that.",
      ],
    },
    {
      heading: "What comes back to the candidate",
      paragraphs: [
        "Usually an accept or a pass, and then the employer's own process, at the employer's pace. Acceptance is not an interview. It means someone put your name in front of a hiring manager, which is more than most applications achieve and less than a job offer.",
        "Silence is normal and usually structural: requests expire, teams stop hiring mid-quarter, and people forget. If the status does not change for a long time, treat it as a decline rather than a rejection of you as a person.",
      ],
    },
    {
      heading: "If you are the employee thinking about it",
      paragraphs: [
        "The time cost is a few minutes of reading and one message, not an ongoing duty. You are agreeing to pass a name along, not to advocate for the outcome or to follow up on their behalf.",
        "You can decline without giving a reason. In every honest version of this, declining is cheaper than being the person who forwards something they do not believe in, and services that measure referral volume instead of referral accuracy are not measuring the thing that helps a candidate.",
      ],
    },
  ],
  faq: [
    { question: "What does an employee see when someone sends them a referral request?", answer: "Usually three things: the role, the applicant's resume, and a short note about why they are applying. Not a cover letter, and not their contact details unless the employee chooses to share them." },
    { question: "Does my employer find out that I sent a referral request?", answer: "It depends on the service. In an employee-mediated model the employer sees nothing until an employee forwards the application. In a direct-submission model the employer sees it immediately. Check which one you are using before you upload a resume." },
    { question: "What happens if the employee passes on my request?", answer: "Nothing is charged in services that spend a credit only on acceptance. A pass is usually about timing, band, location, or whether the team is hiring that role at all, rather than about the quality of your application." },
    { question: "How long does a referral take?", answer: "It depends on a person acting. Employee-mediated review is slower than applying directly because a human has to choose to pass it on, and most of the wait is the employer's own hiring schedule rather than the platform." },
  ],
};

/** Every guide, in the order the sitemap lists them. */
export const GUIDES: readonly Guide[] = [JOB_REFERRAL_PLATFORMS, CHOOSING_A_JOB_REFERRAL_PLATFORM, HOW_EMPLOYEES_REFER_CANDIDATES];

const GUIDE_BY_ROUTE: ReadonlyMap<string, Guide> = new Map(GUIDES.map(guide => [guide.route, guide]));

export function guideFor(path: string): Guide | undefined {
  return GUIDE_BY_ROUTE.get(path);
}

/**
 * The other guides. Derived, never stored: a hand-written "related" list is a
 * second thing to forget when a guide is added or renamed, and a guide with no
 * inbound link from a sibling is an orphan as far as a crawler is concerned.
 */
export function relatedGuides(guide: Guide): readonly Guide[] {
  return GUIDES.filter(candidate => candidate.route !== guide.route);
}
