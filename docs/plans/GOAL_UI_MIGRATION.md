# Goal-UI migration spec - for build desk (via parent)

Source of truth: goal-ui-doctrine.md (owner-decided Oct 21). Reference captures: landing, home, company, requests, plans at 390+1280 (attached to the design report, Oct 21 ~2:28 PM).

## Scope

Migrate every user-facing screen, landing through platform, to the goal-first pattern. Retire the yellow/blue kit: remove kit imports, colour literals, pills and banners wherever they survive. Applies to seeker, referrer, and company surfaces.

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

## Surface claims (build coordination - owner: "help yourself by dividing the pages or parts", phonemsg-01M5DCE8P61ZGMTD8YBSBGC46Q)

Claim a surface row before starting it; update the PR and status as you go. Order follows the owner's sequence: landing, home, company, requests, plans, then the remaining seeker/referrer surfaces.

| Surface | Claimed by | PR | Status |
| --- | --- | --- | --- |
| Landing (signed out) | Instinct (build+screener agent) | - | starting |
| Home (seeker) | - | - | open |
| Company | - | - | open |
| Requests / My asks | - | - | open |
| Plans | - | - | open (designer updating screens for D-115/D-122/D-124) |
| Remaining seeker + referrer surfaces (inbox, conversation, settings, impact, admin) | - | - | open |
