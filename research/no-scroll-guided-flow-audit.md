# Fixed-Viewport Guided-Flow Audit

## Product rule

skipwait.me should behave like a focused mobile transaction rather than a feed or document. A user should see the current task, understand its one primary action, and move forward without scrolling for orientation. The design target is a single viewport with a persistent action area; secondary content belongs behind an intentional drill-in, not below the fold.

## Mobile audit findings

The current landing, opportunity discovery, employee opportunity posting, share-preview, token purchase, request history, settings, and signed-out administration screens contain long stacked cards or explanatory panels. The pre-authentication Admin screens already fit the target model; the other routes should be reorganized into discrete steps.

| Flow | Current issue | Fixed-viewport direction |
| --- | --- | --- |
| Landing | Two role cards plus workflow detail extend beyond the first decision | Keep only promise and two full-width role actions; move workflow detail into the selected flow |
| Job Seeker onboarding | Form, credibility cues, and context compete vertically | One field group per step with a fixed Continue action |
| Referral request | Resume, request context, token state, and sign-in can accumulate | Stepper: role link, document, review/send; one task per screen |
| Referrer access | Direct OTP is compact but should reserve space for code/error states | Maintain fixed card and bottom action area |
| Token purchase | Packs and custom quantity can become a long product page | Keep recommended packs on one screen; show custom quantity only on an explicit compact drill-in |
| Opportunity Wall | Explanation and available openings may form a feed | Show one relevant opening at a time with previous/next controls, not a vertical list |
| Employee post | Composer and live preview are stacked | Split into Compose and Preview/Publish steps |
| Share preview | Multiple share choices and explanatory content stack | Reveal one share action at a time after Copy, with a compact More option |
| Admin screens | Data tables and diagnostics necessarily contain more information | Preserve compact authenticated dashboards with their own bounded internal panels; keep mobile default focused on one metric/action at a time |

## Non-negotiable implementation constraints

1. Mobile layouts use `min-h-dvh`, fixed top context, and a fixed or sticky bottom action area.
2. Pages must not use document-level scrolling for the primary path. When a task needs additional information, show a named subsequent step, disclosure panel, modal, or bounded internal scroll region.
3. Every step has one dominant action and, where needed, one quiet Back action.
4. Browser back, explicit Back controls, and draft persistence remain available; no user should lose a partially completed referral.
5. Accessibility requirements override the visual rule: keyboard focus, validation messages, and enlarged text must remain reachable through bounded internal scrolling rather than clipping content.

## Completed core-flow verification

The mobile landing, Job Seeker link onboarding, resume/send request flow, token purchase, My Requests return home, My Company Inbox entry, Opportunity Wall, Referrer work-email entry, and employee opportunity-posting first step were checked at a 375×812 viewport. Each now uses a single screen with a fixed or anchored action area.

| Flow | Verified mobile interaction |
| --- | --- |
| Landing | Two direct role actions plus a quiet openings link fit within one viewport. |
| Onboarding | A single job-link input and persistent Continue action form step 1. |
| Request | Resume attachment is step 2; send is anchored at the bottom. A post-send email appears as its own step. |
| Token purchase | Currency, 1/5/10 packs, optional custom quantity, total, and checkout fit in one viewport. |
| My Requests | One request is shown at a time; Previous/Next replaces a tall ledger. |
| My Company Inbox | One relevant private request is shown at a time; scope tabs and claim action remain fixed. |
| Opportunity Wall | One opening is shown at a time; Previous/Next replaces a feed. |
| Referrer access | The direct company-email OTP entry fits without scroll. |
| Employee opportunity post | The initial opening-type and role step fits; details and timing are separate stages. |
