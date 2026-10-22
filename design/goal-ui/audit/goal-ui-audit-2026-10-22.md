# Goal-UI audit of live skipwait.me (Oct 22, 2026, 2:00 PM IST)

Method and proof limits
- Rendered 39 live routes at 1280 and 390 (headless Chrome, 1x). All 78 PNGs are in audit-captures.zip (aud/<route>-1280.png and -390.png). Contact sheets attached.
- I rendered signed out. For signed-in pages (requests, queue, inbox, profile, settings, referrer*, work, verify, billing, premium, alerts, messages, invite, landed) the live capture shows only the sign-in gate. Their signed-in layout is therefore UNVERIFIED live. I classified them from the page source on main (imports of Goal* components, kit classes) plus the gate. Real signed-in captures need the QA account.
- Traffic order: I have no analytics access. The order below is journey position (first touch to money), not measured traffic. Traffic is UNVERIFIED.
- Migrated, from source and live: /ask (#431), /explore, /explore/:slug (#429), /requests, /queue, /conversation/:id (#432/#433), and /ask signed-out. 7 of about 70 routes.
- No page-level overflow at 390 except /home (right-edge pixels, likely the cookie banner or image; check).

## Verdict per page (goal first = G, recoloured or old layout = R)

### P0: first touch and money (old layouts, highest importance)
1. / (Home) R. Goal: find my company and ask. Live: the new "Nobody reads the pile" hero is goal-first, but the page below is a marketing scroll with a second black block and a cookie banner covering the fold. Needs one search-first screen: company search, one black "Find your company", the proof strip. Cut the scroll to 3 sections.
2. /sign-in R. Goal: get in with the least friction. Live: yellow door illustration, blue "Continue with email", five providers, plus a "Find a referral / Give a referral" mode choice (retired: no mode switch). Needs one goal line from the user's intent (carry the company or ask they came from), one black email commit, providers as quiet outline rows, no mode choice, no yellow, no blue.
3. /start R. Goal: send my first ask. Live: separate "Paste the job link" page with a one-field wizard. It duplicates /ask. Needs to be removed or redirected into /ask (same composer, signed out, "Sign in and send"), so there is one entry.
4. /onboarding R. Goal: get my profile good enough to ask. Live: five-step stepper "Where are you in your search?" before any value, blue accents. Needs to be deferred: ask first, collect only what the ask needs, ask the rest in context (resume at ask, search status after the first ask).
5. /verify R. Goal: prove I work at a company (referrer). Live: blue "Sign in with work email" and a three-card side column. Needs a single flow: work email, code, done, one black commit, blue only on the resulting verified mark.
6. /plans, /premium, /billing, /pricing R (four money pages). Goal: get more credits only when short. Live: /plans shows a card ladder with blue accents, /premium a separate credits calculator, /pricing a long text policy page, /billing a "Manage plan" shell. Needs one money surface (plans with credits and billing inside it), a quote tied to the ask ("Add 2 more credits"), and /pricing as a short factual page. #416 holds the V2 copy. Flag: go-live needs the owner's word.
7. /alerts, /inbox, /messages R. Goal: know what needs my reply. Live: three separate surfaces. /messages is a standalone card with a blue button, /inbox and /alerts sit in the shell with a big title and a blue "Sign in". /thread is an alias. Needs one inbox: needs-reply first, then updates. Fold alerts and messages into it.
8. /profile, /settings, /work R. Goal: manage what referrers see. /profile "Profile & privacy" and /work "Your work, in one quiet place" are two profile pages. Settings is a tab form. Needs one profile page ("what a referrer sees", live preview) and settings reduced to account, notifications, region.

### P1: referrer and organisation journeys
9. /referrer R. Goal: set up to help. Live: "Open doors. On your terms." hero plus a work-email modal over a tabbed dashboard. Needs a three-step setup list (verify, set capacity, go live) with one next step.
10. /referrer-home R. Goal: see what needs me today. Needs to be the /queue pattern, or be merged into /queue. Two referrer home pages today.
11. /referrer-setup, /referrer/impact R. Impact: honest "not enough data" states and no invented figures. Setup merges into /referrer.
12. /invite R. Goal: bring a colleague. Live: a request/invite tab pair and a blue sign-in card. Needs one action and a copyable link.
13. /landed R. Goal: close the loop after I got the job. Live: confetti card and blue "Thank your referrer". Needs one plain thank-you step. No celebration copy.
14. /for-companies, /employer, /employer/talent, /employer/billing, /employer/opportunities, /post-opportunity, /wall R. Goal: get verified referrers and post roles. /for-companies is a marketing page with a blue dot and a logo wall (check the logo wall for implied endorsement). The employer pages have no live capture. Needs one organisation home: post a role, see asks, respond. The charging side needs the owner's word.
15. /jobs R. Goal: find a role to ask for. Live: standalone page, old header, third browse surface beside /explore and /wall. Merge into /explore as a roles view.
16. /share, /share-card, /fast links R. Goal: share an ask link. Live: a bare card with a black commit; close to goal-first but on its own shell. Move onto the shell. Low effort.

### P2: trust and policy pages
17. /help, /safety R. Goal: answer my question. /help is a searchable accordion (good), /safety has a full-width yellow "next move" banner (retired yellow). Needs the yellow banner removed and one shared help and safety layout.
18. /about, /contact, /support, /terms, /refunds, /privacy, /guidelines, /shipping, /cancellations R. Goal: state the facts. Live: legal pages use the old header (a yellow-and-blue brand mark), a "short version" grey card and a long scroll. Move to one document layout on the goal shell. Copy stays; no structure change except a "short version" first.
19. /developers, /connect-assistant, /developer-console, /assistants, /approve R. Goal: connect an assistant. Live: blue buttons and cards. Low traffic; move later.

### P3: admin (about 16 routes), internal only
/admin/*: kit tables. Low priority. Use a goal-style queue: one next item, approve or reject, evidence beside it. Do after the user journeys.

## Journey flows (steps, dead ends, extra clicks), from the live captures

Seeker: Home, Explore, Company, Ask, Sign in, Requests, Conversation, Landed.
- Today there are two ways to start an ask (/start and /ask), and /start collects the link alone before the user sees the cost or a company. Extra click: /sign-in asks the user to pick "Find a referral / Give a referral" before the user has done either.
- /onboarding sits between sign-in and the first ask for new accounts: value is delayed by five steps. Fix: sign in on send (as /ask signed-out already does), no onboarding gate.
- Dead end: the empty state of /requests and /inbox shows only a gate when signed out. Signed in it should show the sample asks (#424).
- After "Add 2 more credits" the user goes to /premium, a separate page with a different layout, then has to find their way back. Needs return-to-draft.

Referrer: Home (give a referral), Verify, Referrer setup, Queue, Conversation, Impact.
- Three setup pages (/referrer, /referrer-setup, /verify) and two homes (/referrer-home, /queue). The first screen after verify should be /queue with the next ask highlighted.
- "Give a referral / Work email only" in the rail is the right entry; the modal on /referrer duplicates /verify.

Organisation: For companies, Post role, Employer dashboard, Billing.
- Separate marketing and product pages with no signed-in capture. UNVERIFIED. Likely a dead end after "Book a demo": confirm with a signed-in capture.

Admin: no flow reviewed (not user-facing).

## Rebuild queue, in order (structural change, not paint)
1. /sign-in + remove /start (redirect to /ask) + defer /onboarding
2. / Home single-screen search-first
3. Money: one /plans surface with return-to-draft, /premium and /billing folded in (flags OFF; needs owner's word for go-live)
4. One inbox (/inbox absorbing /alerts, /messages, /thread alias)
5. /verify + /referrer + /referrer-setup + /referrer-home into one referrer setup and /queue as home
6. /profile + /work + /settings into one profile and one settings
7. Organisation: /for-companies + /employer* + /post-opportunity + /wall + /jobs
8. /landed, /invite, /share
9. Policy and help pages on one document layout (yellow banner on /safety goes first)
10. /developers family
11. Admin
Rule for build: each item ships with the goal line, one black commit, a structural diff against the old page (routes removed or merged), and live 1280 and 390 signed-in captures as proof.

Unverified: signed-in layouts of the P0 to P1 authed pages, traffic ranking, the Home 390 right-edge hits, and the employer pages.
