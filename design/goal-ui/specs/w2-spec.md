# W2 SPEC - seeker spine (rebuilt Oct 22 from the current repo + comps; mocks: company, ask, conversation x 1280+390)

Basis: design/goal-ui/pick comps + tokens.css/shell.css (the mocks use the real pick shell, rail, topbar, bottombar and --sw-* tokens). DOCTRINE: goal line in the user's words, one next step, one black commit, honest status, blue #1D4ED8 only as the verified mark, mono numerals, dot+text status, no pills, no mode switch, no India/Global toggle. Samples shipped (#424/#425) stay behind server flags.

Standing acceptance per slice: GoalAppShell only; 0 kit imports; 0 colour literals; GoalStates for loading/error/empty; 1280+390 captures on branch; copy from moneyCopy/planFamily constants; flags OFF.

## 1. /explore/:slug (company page) - FIRST (every directory row links here since #419)
Mock: company-1280/390.png. Replaces kit classes (company-page, company-hero, back-link, no-results, eyebrow, quality-list, privacy-preview) and kit Button/RequestDialog.
Order: back link "All companies" -> hero (mark + availability + name + functions) -> goal line "Ask a verified employee. Your name and resume stay private until they accept." -> ONE black commit "Ask for a referral" (opens the W1 AskDrawer in place; full-width at phone) -> ASK_COST_SENTENCE ("3 free credits every month; extra asks use credits.") -> Company responsiveness -> Open roles from verified employees -> Before you ask -> What is shared, and when?
- Availability: not shown (D-176, superseding D-169). No "People open to referral requests" / "Not open yet" dot, ring or label, and no ghost "Ask anyway": the one black commit is the same whether or not a verified employee is available, because availability only routes the request (to available verified employees, or into the company's private pool for those who join later, D-174). After saving, say plainly which happened, never a false immediate-referral claim (D-176). The notify-me "Alert me" link waits for its ruling under D-176 and D-193 (6).
- Company responsiveness: keep CompanyResponseSignal logic; when there is not enough data show the honest line "Not enough requests yet to show a response signal. We never show a number we can't back." Never invent a figure.
- Open roles: rows, not cards (title, location, mono POSTED date, "Posted by <first name>" or "Posted by a verified employee"); per-row outline "Ask for a referral" -> /ask?post=<id>&job=<url>. Walk-ins show the mono date-time. Loading = GoalSkeletonRows; empty = one quiet line inviting employees to post; failed read never blocks the page (keep).
- Before you ask: lead "Bring the role. We'll guide the request." + body + 3 numbered points (mono 01-03), copy VERBATIM from current page (Use the exact job link / Make your fit easy to see / Respect the decision).
- Privacy block: lock + "What is shared, and when?" + existing sentence + link "Read safety guide" (/safety).
- Unknown/hidden slug -> NotFoundContent (keep). Error -> GoalErrorState with Try again. Loading -> skeleton hero + rows.
- Phone: stack; commit and per-role CTAs full-width; truncate long role/location lines with min-width:0.

## 2. /ask (composer page)
Mock: ask-1280/390.png (V2 shortfall shape shown). Same anatomy as the W1 drawer, as a page: job link (with pass/fail hint), resume (file row + "Shared after a referrer accepts"), "Why me" as THREE reason cards 01-03, each up to 140 chars with live mono count (D-077(4)); composed client-side into the existing 600-char note (no schema change). Blue only on "Goes to verified <Company> employees".
Cost/commit logic (reuse useAskQuote + findModel.costLine):
- Flags OFF: "Uses 1 of your N credits." + refund rules; commit "Send ask".
- V2 ON, enough credits: "This ask costs N credits. You have M." commit "Send ask".
- V2 ON, shortfall: "This ask costs N credits. You have M. Add K more." and the ONE black commit becomes "Add K more credits" -> /premium?quantity=K; "Save draft" stays ghost. (Never two black buttons.)
- Refund rules always visible before send: comes back if you withdraw before pickup or if nobody picks it up within 7 days; once picked up it stays spent, even if they pass.
Sent state (ask-sent): GoalStatus Waiting + "Your ask is with verified <Company> employees." next-step line; commit "See my asks"; ghost "Ask another company". No celebration copy.

## 3. /conversation/:id
Mock: conversation-1280/390.png (seeker view, Accepted). Header: company, role + mono SENT date. Status row: dot + status word + mono 4-stage stepper (Waiting, Under review, Accepted, Referred) using the shipped askView vocabulary. One next-step sentence (shipped askNextLine copy verbatim). Thread: sender + mono timestamp, message, reply composer with one black "Send". Unclaimed asks show a ghost "Withdraw ask" (credit back per rules). Closing honesty line: "A referral is an introduction. It never promises an interview or a job. Companies decide hiring." Referrer-side variant (W4): Accept (black) / Pass privately (ghost), D-052 quick replies release the credit and the copy says so at the tap.

## 4. Remaining W2 screens (no mock; transcription + deltas)
/sign-in, /verify, /start, /onboarding: goal line per screen in the user's words, one commit, GoalStates for errors; no India/Global toggle; keep every error string verbatim (already well-written); phone: single column, commit full-width above the keyboard.
