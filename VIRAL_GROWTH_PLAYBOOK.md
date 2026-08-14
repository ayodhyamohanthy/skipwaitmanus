# skipwait.me: Privacy-Preserving Viral Growth Playbook

## The core idea

skipwait.me should not try to become viral by asking users to “invite friends” in the abstract. Its durable growth unit is **company liquidity**: a Job Seeker has a live Target Role URL at Company X, while eligible employees at Company X can safely discover, claim, and help with that request. Every action should increase the number of verified employees at a company, the number of quality requests they can see, or the number of people who learn that the company is covered.

> **Growth promise:** “Know someone at this company? Bring them into a private, verified referral circle—without exposing employee identities.”

The existing product model is a strong base. The Job Seeker has a meaningful moment—the role they want—while the Referrer has a credible identity signal—a verified work email. This is more useful than a generic referral reward because it creates a highly specific reason to invite someone.

## The two-sided loop

| Moment | Job Seeker action | Verified employee action | Growth result |
| --- | --- | --- | --- |
| A Job Seeker adds a Target Role URL | The platform identifies the target company and checks coverage | Existing verified employees become eligible for a private request | A real opportunity creates immediate demand for company coverage |
| The company has little or no coverage | The Job Seeker shares a prefilled “Do you work at Company X?” invitation | Employees verify their work email and join the hidden company pool | Each request can recruit the exact supply needed to fulfill it |
| A request is claimed | The Job Seeker gets private status updates, not employee names | The Referrer can invite one or two trusted colleagues to keep coverage healthy | Helpful behavior expands supply without forcing public identity |
| The request closes | The Job Seeker can share a truthful “I used skipwait.me for this role” card | The employee can share a “help your company’s candidates” card | Real workflow completion becomes the distribution event |

The essential difference from a broad contact-sync product is that skipwait.me should first ask **who can help with this exact company**, rather than asking for every contact a person has.

## The highest-leverage growth mechanics

### 1. Company coverage invitations

When a Job Seeker pastes a Target Role URL, display a small coverage state. If enough verified employees are available, say that the request can be routed privately. If coverage is low, do not block the request; instead, offer a focused share action:

> “Help us reach verified employees at **Company X**. Share a private invite with anyone you know there.”

The share copy should be personal and factual: “I’m applying to a role at Company X through skipwait.me. If you work there, you can verify your work email and choose whether to review the request privately.”

This works on WhatsApp, LinkedIn direct messages, email, and text because the recipient has a clear reason to act. The link should take the employee directly to a work-email verification screen, not a generic landing page.

### 2. A hidden, verified employee pool

The employee acquisition product should be framed as **“help your company’s candidates privately”**, not “become a Referrer.” The latter sounds like an obligation; the former is opt-in contribution.

The employee enrollment flow should be one screen: verify work email, choose the job families they are open to reviewing, and choose a monthly request capacity. The employee’s name, email, and contact details should remain hidden from Job Seekers by default. A simple badge such as “Verified employee at Company X” can exist without revealing the individual.

The growth prompt for employees should come after they have a positive, bounded action: “Your company now has 2 verified employees. Invite one teammate to make sure requests are covered when you are busy.” Do not reward indiscriminate invitations; reward **verified company coverage**.

### 3. The post-submission share card

The Job Seeker’s confirmation screen is a high-intent moment. Add a share card after the private request is created:

> “Know someone at Company X? They can join the verified employee pool and decide privately whether to help.”

Offer **Copy link**, **WhatsApp**, **LinkedIn message**, and **Email**. The default should be copy or an app-specific intent link; posting publicly must always be a deliberate user action. The shared page should contain no resume, applicant name, or job-seeking status unless the Job Seeker explicitly opts in to reveal it.

The card should also support a truthful status version: “I’m using skipwait.me to reach the right people for a role at Company X.” Avoid claims such as “I got referred” or “I was hired” until they are true.

### 4. Referrer-to-colleague invitations

Employee referrals are fragile when one person is overloaded. After an employee claims or resolves a request, show a compact capacity prompt:

> “Keep Company X covered. Invite a teammate with a verified Company X email.”

Make the invite specific to the company, and prefill the message. The recipient sees that they are joining a private pool rather than being publicly listed as a referral contact. This protects employees while encouraging dense company clusters.

### 5. The Opportunity Wall as a public acquisition surface

The Opportunity Wall should become the public-facing supply signal. It should not publish employee names by default. Instead, it can show cards such as:

| Public card | Private detail |
| --- | --- |
| “Verified employees at Company X are reviewing Product requests this week” | Employee names and work emails remain hidden |
| “2 verified employees available for Data roles” | Capacity and internal routing stay private |
| “Company X coverage is growing—join with a work email” | The invite destination verifies eligibility |

Every card can be shared on LinkedIn, WhatsApp, X, or relevant professional communities. The call to action is not “apply now”; it is “verify your work email to strengthen coverage for your company.” This creates an employee-acquisition loop while preserving trust.

### 6. Truthful outcome sharing

After a concrete milestone, let the user decide whether to share it. Examples include “My request was claimed by a verified employee” or “I completed a referral request through skipwait.me.” These should always be opt-in, editable, and free of identifying details by default.

Outcome sharing is powerful because it shows a real action, but it must never manufacture social proof. Do not create fake review cards, referral counts, hiring claims, or testimonials. Every share should be based on a user’s actual request or actual employee action.

## Contact sync: use it later and use it narrowly

Contact sync can be useful, but it should not be the first viral mechanism. It has high privacy sensitivity and weak intent when introduced too early. Start with targeted manual sharing, then add **consented company-targeted contact matching** after the core request-claim loop converts reliably.

The right version is not “upload all your contacts.” It is:

1. Ask for explicit permission at a clear moment: “Find people you already know at Company X.”
2. Explain exactly what will happen, how long the data is retained, and how to delete it.
3. Let the user choose contacts or copy a message; do not auto-send invitations.
4. Match only the minimum required data, preferably privacy-preserving email-domain or hashed-email matching where appropriate.
5. Never scrape LinkedIn contacts or imply a LinkedIn integration without an approved, user-authorized integration.

An even simpler early version is a **company-specific share composer** with no address-book import: the user chooses WhatsApp, email, LinkedIn message, or copy link and sends the invite themselves.

## MVP experiments, in order

| Priority | Experiment | Hypothesis | Primary success metric | Guardrail |
| --- | --- | --- | --- | --- |
| 1 | Post-request “Know someone at Company X?” share card | A specific company ask converts better than a general invite | Shares per submitted request | No applicant identity in default preview |
| 2 | Verified employee landing page from the share link | Work-email verification is low-friction when context is company-specific | Verified employees per shared invite | Work email required; consumer domains rejected |
| 3 | Employee capacity invitation after a completed action | Helpful employees invite trusted colleagues when prompted at the right moment | Verified colleague joins per active employee | No public employee directory |
| 4 | Company coverage meter | Users share more when they can see a concrete coverage gap | Company coverage lift after a request | Never reveal low counts that could identify employees |
| 5 | Anonymized Opportunity Wall | Public supply signals attract matching employees and Job Seekers | Organic visits to employee verification | No employee names or applicant documents |
| 6 | Consented contact matching | Address-book matching increases targeted employee discovery | Verified employee conversion from matching | Clear consent, deletion, and no auto-send |

## Metrics that matter

Do not optimize only for invites sent. A healthy loop needs high-quality, privacy-safe conversion.

| Layer | Metric | What it tells you |
| --- | --- | --- |
| Demand | Submitted requests by target company | Which companies have real Job Seeker demand |
| Distribution | Share-card open and send rate | Whether the company-specific invitation is compelling |
| Supply | Work-email verification rate | Whether employee enrollment is easy and credible |
| Liquidity | Verified employees per active company | Whether a company can reliably fulfill requests |
| Match | Share of requests claimed within 24–72 hours | Whether supply meets demand |
| Quality | Approval, response, or positive employee-action rate | Whether requests are worth employee attention |
| Safety | Blocks, complaints, unsubscribe rate, and share abandonment | Whether growth prompts are becoming spammy |

The north-star metric should be **claimed private requests per active company**, supported by the median time to claim. This connects growth directly to user value instead of vanity invitation volume.

## Anti-spam and trust rules

The product’s virality should feel like professional help, not recruitment spam. Enforce the following rules from the first release:

- Every email, WhatsApp, LinkedIn, or SMS message is user-initiated and editable before sending.
- No automatic address-book invitations, no auto-follow-ups, and no scraping of professional networks.
- Rate-limit invitations by user and company; start with a small number of sends per day.
- Do not reveal which employees were invited, verified, online, or available.
- Make “not interested,” unsubscribe, and contact-data deletion easy.
- Prefer an invitation to a **company pool** over an invitation to expose or pressure one named employee.
- Reward quality milestones such as work-email verification and a responsibly claimed request, not raw invite volume.

## First implementation sequence

Build the first loop before implementing contact sync:

1. Add the post-request company-specific share card with Copy, WhatsApp, LinkedIn message, and Email actions.
2. Build a deep-link employee verification page that says exactly why the person is being invited.
3. Add an employee capacity screen and a single colleague-invite action after a claimed request.
4. Add an anonymized company coverage state to the Target Role URL and request confirmation screens.
5. Measure share-to-verification-to-claim conversion for a small group of target companies.

Only after these actions create reliable company clusters should skipwait.me introduce consented contact matching. That ordering preserves the product’s core promise: **speed and trust first; distribution second.**
