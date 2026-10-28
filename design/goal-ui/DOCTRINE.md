# DESIGN.md amendment - Goal-based UI (DECIDED, owner Oct 21)

Owner direction, verified on his channel:
- phonemsg-01M5DBPF2PH63WGW7MP7YK6FDW (Oct 21, 12:43 AM): "design the goal focused ui across the app"
- phonemsg-01M5ETQ6PPYH0M6P76Y1KVTZZC (Oct 21, 2:24 PM): "Please update everything to goal based ui. I dont want to see the yellow blue previous designs. Please update in instructions"
- phonemsg-01M5ETTGJZN2HXTEPZW72JBPG5 (Oct 21, 2:26 PM): "goal focused ui is our design now from landing to platform... update in docs to not waste time repeating the same thing as old designs or codes show up. As we move forward all our new decisions should be in sync fullstack front and backend."

This is decided design direction, not a proposal. It supersedes every older screen design. The retired yellow/blue kit language must not reappear in code, mocks, docs, or instructions.

## Doctrine

1. Every screen opens with the user's goal, stated in their words, not the product's.
   - Right: "Get referred." / "Get referred at Quillmint." / "Get your asks answered." / "Choose your reach."
   - Wrong: "Welcome to SkipWait", "Dashboard", brand taglines.
2. Every screen names one next step and gives it one clear action.
   - The next step sits in a bordered "Your next step" block with a single black commit button.
   - One black commit action per screen. Everything else is a ghost button or a plain link.
3. Honest status, always: cost before every ask, real availability ("3 verified employees, usually answers in 2 days"), never a promise of outcome.
4. The price depends only on the job's level, never on the person asking.
5. New decisions stay in sync fullstack: prices, tiers and rules are current-best-and-changeable config, not hard-coded literals.

## Palette (formalizes the owner's D-070 pick of Oct 18)

- Ink #0A0A0A on white; hairline #EBEBEB; control edge #8A8A8A.
- Trust blue #1D4ED8 appears only as the verified mark (and its attached word).
- Emerald / amber / crimson appear only as status dot + text. Never as fills, banners, or pills.
- No yellow anywhere. No blue buttons or decorative blue links. No pills, no badges, no mode switch.
- Numerals in JetBrains Mono; words stay in the sans face.

## Carries over unchanged

GoalShell layout, type scale, one-commit rule, dot+text status, copy re-read before ship, 1280+390 captures on every UI branch.

## Amendment - goal-oriented design + benefit-oriented copy (owner, Oct 27)

Owner direction, verified on his channel:
- phonemsg-01M5Y1HVMB69M0V3AQR8HJYEAE (Oct 27, 12:12 PM): "Goal oriented ui design & us, benefit oriented ux copy/microcopy" ("& us" preserved verbatim; likely "& UX", unresolved - do not build on the guess)

Read with the doctrine above and frozen D-153 (plain intent first, promise only what works):

1. The screen serves the person's goal; the words sell the benefit, not the feature. Every heading, button, empty state and error says what the person can achieve here, what happens next, and - on failure - what to do about it.
2. This is beyond terminology: replacing retired nouns ("ask", "credit") is the floor, not the bar. Copy is reviewed for benefit clarity before a screen ships, the same way captures are.
3. No invented promises and no old-design reskins: benefit wording states only what works today (D-153 honest status), and the retired yellow/blue kit stays retired.
4. This reopens no frozen decision and changes no legal, pricing or payment semantics.
