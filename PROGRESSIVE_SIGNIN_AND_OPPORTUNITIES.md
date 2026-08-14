# Progressive Sign-In and Verified Opportunity Sharing

## Product position

skipwait.me should not ask users to sign in because the application needs an account. It should ask only when the user is about to create a **private, durable, or trust-sensitive action**. Until that moment, the product should help the person understand their opportunity, see coverage, and make a decision without an identity interruption.

> **Rule:** Let people browse, paste, preview, and choose first. Require sign-in only when they upload private material, join a verified employee pool, publish an opportunity, claim a request, or spend a token.

This approach protects trust while keeping the first meaningful interaction fast. It also gives sign-in a clear explanation: it protects the user, not the platform’s conversion funnel.

## The right sign-in moments

| User | Do not require sign-in for | Require sign-in at | Why the gate belongs there |
| --- | --- | --- | --- |
| Job Seeker | Landing, Opportunity Wall, Target Role URL input, coverage preview, and drafting an in-progress request | First resume upload or the final “Send private referral request” action | A resume is private and the request must have a durable owner |
| Returning Job Seeker | Reviewing an in-progress local draft and a prefilled role URL | Reopening a saved request, uploading, or sending | The user already sees progress before they are asked to identify themselves |
| Prospective Referrer | Opportunity Wall, company coverage, role summaries, and “how private referrals work” | Joining a company pool, claiming a request, or publishing an opportunity | Work-email verification only matters when the employee wants to affect routing or visibility |
| Verified Referrer | Viewing their own company opportunity drafts and private capacity status | Publishing or editing an opportunity, claiming a request, or opening candidate documents | Each of these actions changes durable data or unlocks private candidate context |

The practical implementation is **progressive sign-in**, not an anonymous referral system. A Job Seeker can complete the cognitive work—“this is the role I want; this is the opportunity I found”—before the secure upload card explains: “Sign in to protect your resume and route this privately.” The draft must survive the sign-in round trip so the user never re-enters a role URL or loses their decision.

## Job Seeker experience: no account wall before intent

The ideal Job Seeker path has three beats:

1. **Paste a Target Role URL.** Immediately show the company, the role link, and a simple coverage signal. The user should not be asked for a password, a profile, or a long form.
2. **Choose to request privately.** Show the next practical requirement: a resume. Only when the user taps the upload surface should skipwait.me open the secure sign-in sheet.
3. **Return exactly where they were.** After Clerk sign-in, restore the URL, name if provided, selected state, and upload context. The first uploaded resume becomes the required document; every further document is visibly optional.

The UI copy should make the gate self-explanatory:

> “Your role is saved on this device. Sign in only to protect your resume and send this request privately.”

For a returning user, use a one-tap continuation wherever the device supports it. Do not show a generic “create account” screen. Show **“Continue securely”** and return the person to the exact step they chose.

## Referrer experience: browse first, verify only to participate

The current Referrer route is a secure employee entry point. It should evolve into two layers.

### Layer one: public opportunity discovery

Anyone can browse an anonymized **Opportunity Wall** without signing in. Each card is a verified-employee signal, not a public employee directory:

| Visible to everyone | Never visible by default |
| --- | --- |
| Company, role family, location or walk-in area, timing, application link, and whether private referrals are welcome | Employee name, personal email, work email, employee count, candidate names, resumes, or private request details |
| “Verified employee at Company X is welcoming referrals” | The identity of the individual employee |
| “Walk-in this Saturday, 10:00–14:00” if the employee confirms it is shareable | Internal recruiting conversations or confidential hiring plans |

The public card gives Job Seekers a low-friction reason to act: **“Use this opportunity”** pre-fills the Target Role URL or opportunity context and starts a referral request draft. Sign-in waits until upload or send.

### Layer two: verified employee participation

The Referrer sees a clear choice before sign-in:

> “Work at a company that is hiring? Join privately with your work email.”

Only after the employee taps **Join company coverage**, **Claim a request**, or **Publish an opportunity** should the system ask for Clerk sign-in and work-email verification. The explanation should be singular and specific: “We verify your work email so Job Seekers can trust the company coverage without seeing your identity.”

This is lower friction than gating the entire Referrer page, because a potential employee can first understand what they are joining and why it helps.

## The 20-second opportunity post

An employee should be able to tell Job Seekers that their company is hiring without building a full job-board post. Create one compact composer called **“Share an opportunity”** with two modes:

| Mode | Required inputs | Optional inputs | Default public card |
| --- | --- | --- | --- |
| Hiring now | Role title or job URL | Location, short note, referral capacity | “Verified employee at Company X is welcoming referrals for [role].” |
| Walk-in | Role or function, date/time, location | Registration link, eligibility note | “Walk-in opportunity at Company X: [role] on [date].” |

The fastest employee flow should be:

1. Tap **Share an opportunity**.
2. Paste a job URL or type a role; choose **Hiring now** or **Walk-in**.
3. Review an auto-generated, editable card.
4. Tap **Publish privately**; only now sign in and verify the work email if needed.

When an employee already verified their email, the company should be inferred automatically. Do not ask them to choose or type the company name again. Let them set one small capacity signal such as “I can review a few requests this week,” but keep it optional and never expose a precise employee count publicly.

The publishing confirmation needs one minimal trust assertion, not a legal wall:

> “I’m authorized to share these public hiring details.”

This protects candidates and the employee without turning a 20-second post into a compliance form. The platform should also clearly prohibit sharing confidential roles, interview material, non-public compensation data, or personal candidate information.

## The reverse-referral loop

The Opportunity Wall creates a stronger growth path than a generic job board:

1. A verified employee posts a company/role or walk-in signal.
2. Job Seekers discover it publicly and tap **Use this opportunity**.
3. They paste or confirm the Target Role URL, then sign in only to protect their resume and send privately.
4. The original employee and any eligible coworkers receive a private, bounded request—not public applicant information.
5. After the employee acts, they see a lightweight prompt to invite a trusted coworker and keep their company covered.

The employee brings supply; the public card attracts relevant demand; a successful request gives the employee a reason to deepen supply. This is a company-level network effect rather than a noisy social feed.

## Friction budget

Every screen should make one decision only. Use this as a non-negotiable review rule.

| Moment | Maximum user effort | What must not happen |
| --- | --- | --- |
| Discover an opportunity | One tap | No sign-in, no profile form, no resume request |
| Start a referral request | Paste or confirm one URL | No work history form, no employee selection, no payment prompt |
| Protect a resume | One secure sign-in sheet | No restart of the request after sign-in |
| Publish an opportunity | Role/URL + hiring mode + publish | No long job description, no public profile setup |
| Join employee coverage | Secure sign-in plus work-email verification | No public listing or forced colleague invitation |
| Share | One app-specific action or copy link | No automatic contact sync or auto-send |

## What to build first

Start with the smallest loop that has both growth and direct user value.

1. **Public Opportunity Wall cards.** Show anonymized verified-company hiring and walk-in signals.
2. **Use this opportunity.** Pre-fill the Target Role URL and keep the Job Seeker anonymous until resume upload or send.
3. **20-second employee post.** Offer role/URL, mode, optional timing, then verify work email at publish.
4. **Post-request company share card.** Let Job Seekers bring verified employees from the target company into coverage.
5. **Employee coverage invite.** After a useful action, invite one trusted colleague—not an address book.

Delay full contact synchronization. It has meaningful privacy, platform-policy, and user-trust costs. The company-specific share card and opportunity deep link will reveal whether skipwait.me can create dense company clusters before adding a more sensitive acquisition mechanism.

## Metrics and stop conditions

Measure the entire loop, not merely posts or sign-ups.

| Metric | Healthy signal | Warning sign |
| --- | --- | --- |
| Opportunity card → request draft conversion | Job Seekers understand and act on the card | High views with little role-url confirmation |
| Draft → secure sign-in conversion | The privacy explanation is credible | Large drop at upload or send |
| Employee post → work-email verification | The publishing value is clear | Employees abandon before verification |
| Request claim time | Company coverage is becoming liquid | Requests remain unclaimed despite opportunity posts |
| Share → verified employee join | Targeted sharing reaches the right people | High shares but low work-email verification |
| Safety signals | Few blocks, complaints, or report actions | Evidence of spam, misleading roles, or unauthorized walk-in posts |

Pause or tighten the feature if a company accumulates reports, if public cards repeatedly point to expired roles, or if employees feel pressured by candidate requests. Trust is the acquisition channel; preserving it is more important than maximizing invitation volume.
