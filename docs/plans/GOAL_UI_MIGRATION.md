# Goal-UI migration spec - for build desk (via parent)

Source of truth: goal-ui-doctrine.md (owner-decided Oct 21). Reference captures: landing, home, company, requests, plans at 390+1280 (attached to the design report, Oct 21 ~2:28 PM).

## Scope

Migrate every user-facing screen, landing through platform, to the goal-first pattern. **D-150 (owner, Oct 22): "from landing page to whole platform everything should be redesigned as per goal based design ui and ux"; never "black colour over the previous design system".** That includes the employer, admin, developer and system pages, and the flows (UX), not only the visuals. A screen is moved only when it passes the acceptance checklist below; the seven pages that went live in place (D-149) do not yet and are being redesigned. A screen with no row in the contract table gets one, proposed from the doctrine in its pull request. Retire the yellow/blue kit: remove kit imports, colour literals, pills and banners wherever they survive. Applies to seeker, referrer, and company surfaces.

## Per-screen contract (from the verified captures)

| Screen | Goal line | Next step (one black commit) | Supporting |
| --- | --- | --- | --- |
| Landing (signed out) | "Get referred." | "Find your company" | 3-step how-it-goes; fair rules (referring always free, price by job level only, no outcome promises); "Join as a referrer" link |
| Home (seeker) | "Get referred." | contextual - pending confirmation: "I got the referral email" | search field (company/function/level); free-credit line; 3-step how-it-goes |
| Company (e.g. Quillmint) | "Get referred at Quillmint." | "Ask for a referral" (role selected, cost in line) | honest availability (verified employees, answer time, % answered); role rows with level + credit cost; "Claim this company" link |
| Requests / My asks | "Get your asks answered." | the ask needing action: "I got the referral email" | ask list with dot+text status (Sent/Accepted ink, Referred emerald, waiting amber), date + credits in mono; ghost "New ask" |
| Plans | "Choose your reach." | plan card commits ("Start free" / "Start Fast Track" / "Apply") | credits dropdown inside each plan (D-115 steps), this-month total, fair rules footer |

The next-step block is contextual: it shows the single most important pending action for that user on that screen. When nothing is pending, the block collapses to the screen's primary action (search on Home, ask on Company).

## Acceptance checklist (per PR, in addition to D-048 phase-3 gates)

1. Screen opens with the user's goal line; no "Welcome to", no dashboard chrome.
2. Exactly one black commit action; everything else ghost or plain link.
3. No yellow, no blue fills/buttons/links; blue only as the verified mark.
4. Status is dot + text only; no pills or badges.
5. Numerals in JetBrains Mono; no colour literals outside tokens.css.
6. No kit/ imports; GoalShell only.
7. Cost shown before every ask; availability numbers honest or omitted.
8. Copy re-read against the doctrine before ship; 1280+390 captures on the branch.

## Docs to update so old looks never reappear

- DESIGN.md: add the Goal-based UI doctrine section (attached), mark superseded sections.
- Agent/build instructions: point every UI task at the doctrine + these captures; delete references to the yellow/blue kit and its screens.
- Old comp images and kit storybook entries: remove or mark retired.

## Surface claims (through the picker, D-083, D-134)
Nobody claims a surface by editing this file: two agents could each claim the same page and collide. Claims go through `node scripts/next-task.mjs --claim "<model>"`, which hands out each surface as its own row from `docs/plans/D-048-phase-3-split.md` (lanes, dependencies, owned paths), first push wins. The rows for the owner's sequence:

| Surface | Row | Note |
| --- | --- | --- |
| Landing (signed out) | `D-048-p3-home` | done and live (#396, #407, #409; D-131); D-048-F-flags moves its env flags into `goalSurfaces.ts` |
| Home (signed in) | `D-048-p3-home-signed-in` | from the `D-048-P-marketing` packet: a signed-in seeker goes to /explore, a verified referrer to /referrer-home |
| Home (seeker) | `D-048-p3-explore` | done, live in place (#362); D-048-p3-live-review checks it |
| Company | `D-048-p3-company` | from the `D-048-P-seeker` packet |
| Requests / My asks | `D-048-p3-requests` | done, live in place (#360); D-048-p3-live-review checks it |
| Plans | `D-132-plans-v2` (done, flag off), then `D-048-p3-plans` (/billing) | the frozen pricing page (#410, D-132, D-135); D-132-audit checks it before the owner's enable word (D-123), `docs/plans/D-132-pricing-v2.md` |
| Everything else | the rest of the split | one lane packet per cluster |
