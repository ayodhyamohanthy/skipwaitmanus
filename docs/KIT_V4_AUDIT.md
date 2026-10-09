# Kit v4 screen audit — every PNG, fullstack

Audited Oct 9 2026 on production `main` (1fc4214) at 1280 (web) and 390 @2x (mobile) with `scripts/kit-screens/capture.mjs`, against `screens/web` (105 PNGs) and `screens/mobile` (106 PNGs; `03_sign-in__step1-continue-with-email` is mobile-only).

**Owner decisions (Oct 9 2026)** that this audit applies: implement every screen as designed, fullstack; build the kit pricing (Start / Momentum / Land, yearly, credits, open-ask slots) while existing Pro/Max subscribers keep working; build WorkOS password sign-in with forgot/reset; the PNGs win over the earlier founder calls; ship each verified group to `main`. Still never shipped: the kit's DESIGN PREVIEW chips, EXAMPLE/DRAFT banners and sample data. Terms and Privacy keep the binding live legal text inside the kit layout.

**Totals:** 106 distinct screens, 579 differences — data/fullstack 261, UI 145, founder-call reversals 60, preview-only (never shipped) 104, binding legal text kept 9.

Kinds: **data** = needs server data, tables, endpoints or jobs; **ui** = markup, style or copy; **reversal** = undo a recorded founder-call deviation; **preview** = kit preview scaffolding, never shipped; **legal** = binding Terms/Privacy text kept.

## Every PNG

| Screen | Web (1280) | Mobile (390) | data | ui | reversal | preview |
|---|---|---|---|---|---|---|
| `00_x__default` | Does not match. | Mostly matches. | 0 | 7 | 2 | 0 |
| `01_explore__default` | Visually matches at 1280. | Visually matches at 390. | 2 | 3 | 1 | 0 |
| `02_explore-skipwait__default` | Visually matches at 1280. | Visually matches at 390 with identical computed styles. | 1 | 2 | 1 | 0 |
| `02_explore-skipwait__step1-ask-for-a-referral` | The dialog matches at 1280. | The bottom sheet matches at 390, including position: the reference PNG fits the design note on one line, so dialog height and top edge match live. | 1 | 1 | 0 | 1 |
| `02_explore-skipwait__step2-continue` | The 'Your fit' step matches at 1280. | Matches at 390 with the same placeholder and design-note differences. | 1 | 3 | 0 | 1 |
| `03_sign-in__default` | Matches closely (2.1% pixel mismatch): split layout, door story panel, eyebrow, heading, intent pills, context strip, outline Google button, primary email button, 'Create… | Matches closely (3.1%): yellow back band, eyebrow, heading, intent switch, context strip and buttons line up. | 2 | 3 | 0 | 0 |
| `03_sign-in__step1-continue-with-email` | n/a (mobile-only) | Does not match (16% mismatch). | 3 | 3 | 0 | 0 |
| `04_onboarding__default` | MATCH visually at 1280. | MATCH at 390 @2x. | 7 | 3 | 0 | 1 |
| `04_onboarding__step1-skip-for-now` | MATCH at 1280 apart from one copy difference. | MATCH at 390 @2x apart from the same copy difference, which wraps as 'Saved on this device; | 4 | 0 | 0 | 0 |
| `05_ask__default` | LAYOUT MATCHES at 1280: page-heading, the 580/340 two-column grid, the card Panel with pill fields, the 28px-radius textarea with resize grip, the tip and 0/600 counter, … | Same stacked order at 390 @2x. | 12 | 4 | 0 | 1 |
| `06_requests__closed` | Closed tab selected, one Declined row: matches structurally. | Same. | 1 | 1 | 0 | 0 |
| `06_requests__default` | Layout matches: heading with New ask, 3 summary panels, Active/Closed tabs, link-card rows with kit pills, red 'Expires tomorrow' line, 0px overflow. | Same differences at 390@2x, 0px overflow. | 1 | 5 | 2 | 1 |
| `06_requests__first-time` | The empty panel matches (Send icon, 'No asks yet.', kit sub-copy, Finish setup and Explore companies). | Same: the 3/3 full meter and the extra share card push the footer about 30px lower. | 0 | 1 | 1 | 1 |
| `06_requests__slots-full` | Layout matches: 3 panels, a muted nudge panel with an outline 'See plans' button, tabs and rows. | Same differences; | 1 | 0 | 1 | 1 |
| `07_inbox__default` | The list chrome matches: rounded-3xl bordered list, company marks, BadgeCheck/EyeOff icons, two lines per row, time plus StatusPill, lavender highlight on new asks. | Same differences. | 4 | 1 | 1 | 2 |
| `07_inbox__empty` | Matches: MessageSquare icon, 'No conversations yet.', the kit sub-copy, a 'Find a referrer' button to /explore inside the bg-muted rounded-3xl block. | Matches, including the text wrap and the button offset shadow. | 0 | 1 | 0 | 1 |
| `08_thread__default` | Two-column grid matches: the main card has company mark, eyebrow, title, posting link, StatusPill, the 6-stage bar, the identity-hidden ask bubble and the clock line. | Same single-column stack and differences. | 4 | 0 | 1 | 1 |
| `08_thread__referrer-view` | Pixel-identical kit state to default (the kit opens in Referrer view at Requested), and live renders the same referrer-pending view from the preview payload. | Same as default mobile, 0px overflow. | 3 | 0 | 0 | 1 |
| `08_thread__step1-seeker-view` | Close match: 'Asha R. | Matches the stack, 0px overflow. | 3 | 2 | 0 | 1 |
| `08_thread__step3-accept-connect` | Kit modal-backdrop + app-dialog: close X, 'Accept this request?', the ethics checkbox naming Wipro, Cancel and Accept. | The dialog sits at the bottom above the tab bar as in the kit, 0px overflow. | 1 | 2 | 1 | 0 |
| `09_alerts__default` | Close match on layout. | Same as web, plus one sizing difference: the All/Unread segment and Mark all read are min-h-11 (44px, segment outer about 52pt) where the kit is min-h-9 (36px, outer abou… | 4 | 2 | 0 | 1 |
| `09_alerts__empty` | Muted panel, BellOff, 'No notifications yet.', blue Explore companies button with offset shadow and the settings link all match. | Same as web. | 0 | 1 | 1 | 1 |
| `09_alerts__saved-alerts` | Structure matches: kit Panel rows with a yellow company mark, title and subtitle, bell (pause) and trash icon buttons, full-width outline '+ New alert' with offset shadow… | Same content gaps as web. | 5 | 1 | 2 | 1 |
| `10_landed__default` | Diverges. | Same as web: shipped EXAMPLE banner, missing role line, body promoted to foreground text-lg (wraps to two large lines), and the CTA text larger than the kit's. | 2 | 2 | 0 | 1 |
| `10_landed__step1-thank-your-referrer` | Diverges. | Same gaps. | 4 | 3 | 1 | 1 |
| `10_landed__step2-send-thanks` | Close in structure: DoorOpen icon, heading, three bordered BadgeCheck cards, and a two-column action grid. | Same differences. | 2 | 1 | 1 | 1 |
| `11_referrer__default` | Matches at 1280 (2.5%, font hinting). | Matches at 390 (3.6% / 1.4%). | 0 | 2 | 0 | 0 |
| `11_referrer__impact` | Layout matches (2.9%): door icon, YOUR IMPACT STARTS AT ZERO, the heading, the body and the 3-stat row. | Matches (5.4% / 0.6%). | 1 | 1 | 0 | 0 |
| `11_referrer__request-queue` | The structure matches: queue-layout, queue-card and the queue-guidance aside. | Same differences at 390. | 5 | 4 | 0 | 1 |
| `11_referrer__setup-capacity` | settings-layout and settings-panel match (2.8%). | Matches the single-column order and sizes (4.2% / 1.5%). | 1 | 1 | 0 | 1 |
| `12_referrer-home__at-capacity` | Heading, stat row (0/3 with a full meter), the muted capacity panel and the record match. | Same differences, and the page is about 478px shorter because the chips and banner are gone. | 1 | 1 | 2 | 1 |
| `12_referrer-home__default` | Heading, stat row, 'Waiting for you' list shape, record panel and Pause button match. | Same differences at 390. | 3 | 1 | 1 | 1 |
| `12_referrer-home__new-referrer` | The first-ask empty panel with the company name, the 0/0/3-of-3 stats and the record dash match. | Same differences. | 1 | 0 | 1 | 1 |
| `12_referrer-home__paused` | The muted pause banner with Resume, the stats, 'No asks right now / Enjoy the quiet.' and the 'Resume new asks' aside button match. | Same differences, no overflow. | 2 | 0 | 1 | 1 |
| `12_referrer-home__re-verify-due` | The accent banner with CalendarClock and a Re-verify button, the stats and the rows match in structure. | Same differences. | 2 | 0 | 2 | 1 |
| `13_referrer-setup__default` | Matches (2.7%): Verified at Wipro, the 5-step meter with labels, the chips seeded from saved prefs, and Continue. | Matches the layout. | 1 | 0 | 3 | 0 |
| `13_referrer-setup__step1-continue` | Matches (2.2%): Gauge icon, heading, the big number, the slider and Back/Continue. | Matches. | 0 | 0 | 2 | 0 |
| `14_verify__default` | Matches the layout (3.7%): heading, 4-step progress, 2-column company grid with a selected blue border (the earlier border override no longer reproduces), Suggest it, Con… | Matches the stacking. | 1 | 0 | 3 | 1 |
| `14_verify__step1-continue` | Matches the email step (5.2%): Mail icon, 'Your Wipro email', input, lock hint, Back and Send code. | Same. | 0 | 1 | 0 | 1 |
| `14_verify__step2-send-code` | Matches the code step (4.9%): ShieldCheck, 'Sent to asha@wipro.com. | Same differences. | 0 | 1 | 2 | 1 |
| `15_invite__default` | The heading, intent switch and invite-panel match. | Same. | 3 | 2 | 0 | 1 |
| `16_profile__default` | Header, heading, the four outline buttons, the Seeker/Referrer switch and the yellow PRIVACY CONTROLS aside match the kit pixel for pixel (the CSS is the same as kit.css)… | Same verdict at 390. | 4 | 3 | 2 | 2 |
| `16_profile__step2-referrer-profile` | The tab switch, headline placeholder 'Your function at work', Company select and referrer privacy line match. | Matches apart from the same items. | 3 | 2 | 1 | 1 |
| `17_p-asha__default` | Owner panel (Copy link, Share, three visibility cards), hero, Open-to chips, two-column work grid, Pinned marks and footer line match. | Same verdict. | 3 | 2 | 1 | 1 |
| `18_work__default` | Heading, Add work, three principle tiles, the My view / What a referrer sees switch, owner card and 16:9 work cards match in layout. | Same verdict. | 12 | 4 | 0 | 2 |
| `19_plans__default` | Layout scaffold matches: the page heading, a 3-card plan-grid, grid note, credits bar, usage panel, upgrade moments, the yellow fair band, compare table, referrers band, … | Same stack and kit classes at 390. | 11 | 4 | 5 | 3 |
| `19_plans__step1-yearly-2-mo-free` | Reference: signed out with Yearly selected on all three cards (Start $80, Momentum $200, Land $1,000, each 'per year · 2 months free'). | Same as web: no Yearly segment or Land yearly levels, monthly INR cards. | 2 | 1 | 0 | 0 |
| `19_plans__step2-upgrade-to-momentum` | The kit dialog structure matches: modal-backdrop + app-dialog, yellow check tile, h2, paragraph, primary button, centered. | Dialog stacks at the bottom above the tab bar, as in the kit. | 2 | 1 | 0 | 1 |
| `20_billing__cancelling` | The 'Ends 6 Nov 2026 — you keep everything until then.' subtitle and the hidden action row match. | 'Keep my plan' should sit under the subtitle as a primary button. | 4 | 0 | 0 | 1 |
| `20_billing__default` | Panel stack, heading and Compare plans aside match. | Same differences at 390. | 6 | 3 | 0 | 2 |
| `20_billing__free` | Free panel matches: CURRENT PLAN / Free / subtitle / primary Upgrade. | Same at 390. | 3 | 0 | 0 | 1 |
| `20_billing__payment-issue` | The live render is identical to the active default. | Same: no payment-issue panel. | 2 | 0 | 0 | 1 |
| `21_settings__default` | NOT MATCHED. | NOT MATCHED. | 9 | 5 | 1 | 2 |
| `22_assistants__activity` | Same structure: one Panel with 'Everything assistants did', rows and the 'Review waiting approval' link. | Same structure. | 5 | 0 | 0 | 1 |
| `22_assistants__api-tokens` | Matches apart from the token row, which adds ' · sw_7QkA2bLm…' (and ' · used X' when set). | Same token-row difference. | 3 | 1 | 0 | 1 |
| `22_assistants__default` | Layout matches: pill tabs, two connection Panels, the Safety panel with two switches, How to connect. | Matches. | 4 | 1 | 0 | 1 |
| `22_assistants__momentum-or-start` | Layout matches: tabs plus the centred gate Panel. | Matches apart from the plan names. | 0 | 0 | 1 | 1 |
| `23_approve__declined` | Matches: X icon, 'Declined', 'Nothing was sent and no credits were used.' | Matches apart from the footnote. | 1 | 0 | 0 | 1 |
| `23_approve__default` | Sheet layout matches: source line, title, subtitle, note Panel, 3 checks, Decline/Edit/Send. | Same differences. | 6 | 1 | 0 | 1 |
| `23_approve__editing` | Matches: the textarea replaces the note Panel and Edit becomes Done. | Matches. | 3 | 1 | 0 | 1 |
| `23_approve__sent` | Result card matches: check medallion, 'Done', the 'Open requests' outline button. | Matches apart from the body and footnote. | 2 | 0 | 0 | 1 |
| `23_approve__slots-full` | Layout matches: title, body, Manage requests / Keep as draft. | Same differences. | 3 | 2 | 0 | 1 |
| `23_approve__spend-credits` | The credit Panel matches ('3 credits / You have 112 · 109 after this'). | Same differences. | 3 | 1 | 0 | 1 |
| `24_connect-assistant__approved` | Matches (OAuth mode: 'ChatGPT is connected / Taking you back to ChatGPT… / Manage assistants'). | Matches. | 1 | 0 | 0 | 1 |
| `24_connect-assistant__declined` | Matches ('Connection cancelled / ChatGPT has no access to your SkipWait account.'). | Matches. | 0 | 0 | 0 | 1 |
| `24_connect-assistant__default` | Consent layout matches (icons, title, It can / It can never Panels, footnote, two buttons). | Same differences. | 2 | 2 | 1 | 1 |
| `24_connect-assistant__expired` | Visually matches. | Matches. | 1 | 0 | 0 | 1 |
| `24_connect-assistant__not-on-land` | Layout matches. | Layout matches. | 1 | 0 | 1 | 1 |
| `24_connect-assistant__signed-out` | Matches ('Sign in to connect ChatGPT', full-width 'Sign in to SkipWait'). | Matches. | 0 | 1 | 0 | 1 |
| `24_connect-assistant__unverified-app` | Panel layout matches (red border, ShieldAlert, title with the client name, two buttons). | Same body difference (the longer live copy adds a line). | 1 | 1 | 0 | 1 |
| `25_developers__default` | Hero, buttons, 3-card grid, Tools table, Quick start and rule Panels all match structurally. | Same. | 5 | 0 | 1 | 2 |
| `26_developer-console__app-details` | Title, badge, Credentials/Stats/Webhooks/Limits Panels match in order. | Same differences. | 5 | 1 | 0 | 1 |
| `26_developer-console__default` | Header, title, subtitle and app rows match. | Matches apart from the test-row subtitle. | 1 | 1 | 0 | 1 |
| `26_developer-console__in-review` | Panel matches (Clock, title, 'Open test credentials'). | Same. | 1 | 1 | 0 | 1 |
| `26_developer-console__new-app` | Form matches (kind tiles, fields, permissions with review pills, terms, Cancel/Create app). | Same. | 2 | 1 | 0 | 1 |
| `26_developer-console__rejected` | Panel matches (reasons list, Edit and resubmit). | Same. | 1 | 1 | 0 | 1 |
| `26_developer-console__suspended` | Panel matches (ShieldAlert, 'App suspended', Contact safety team). | Same. | 1 | 1 | 0 | 1 |
| `27_safety__default` | Matched. | Matched. | 0 | 1 | 2 | 1 |
| `28_help__default` | Layout matched: Heading, search pill, five category pills plus All, rounded-3xl FAQ list, and muted Still stuck / Rules & policies panels. | Layout matched: three wrapped pill rows, FAQ rows, stacked panels. | 9 | 1 | 3 | 0 |
| `29_report__default` | Mostly matched: flag icon, 'What's going on?', confidentiality line, six radio cards (first selected) and a right-aligned Continue. | Same as web: no banner (all content about 100px higher), 'Back to requests', and a larger Continue. | 1 | 1 | 0 | 1 |
| `29_report__step1-continue` | Diverges. | Same divergences. | 2 | 2 | 0 | 1 |
| `29_report__step2-submit-report` | Mostly matched: shield badge, 'Thanks. | Same. | 3 | 1 | 0 | 1 |
| `30_suggest-company__default` | Layout matched: eyebrow, title with dot, subline, Panel with pill fields, 'You are' role buttons in two columns, and a full-width Submit. | Layout matched (stacked role buttons, full-width Submit). | 1 | 2 | 1 | 1 |
| `31_forgot-password__default` | Missing. | Missing (same NotFound inside the app shell). | 1 | 1 | 0 | 1 |
| `31_forgot-password__step1-send-reset-link` | Missing (no route). | Missing (no route). | 1 | 1 | 0 | 1 |
| `32_reset-password__default` | Missing. | Missing (NotFound inside the app shell). | 2 | 1 | 0 | 1 |
| `32_reset-password__expired-link` | Missing (no route). | Missing (no route). | 1 | 1 | 0 | 1 |
| `33_app-states__default` | MATCHED in layout. | MATCHED in layout. | 2 | 0 | 0 | 1 |
| `33_app-states__install-iphone` | MATCHED (sheet title, 3 numbered steps with Share icon, 'Got it'). | MATCHED. | 1 | 0 | 0 | 1 |
| `33_app-states__loading` | MATCHED (h-8 w-40 bar, h-4 w-56 bar, four h-20 rounded-2xl skeletons). | MATCHED (same skeleton; | 0 | 1 | 0 | 1 |
| `33_app-states__not-found` | MATCHED (SearchX disc, 'This door doesn't lead anywhere.', body, 'Explore companies →' primary, 'Go home' ghost). | MATCHED. | 0 | 0 | 1 | 1 |
| `33_app-states__offline` | MATCHED in layout (muted banner 'You're offline. | MATCHED in layout. | 1 | 1 | 0 | 1 |
| `33_app-states__payment-failed` | MATCHED in layout. | MATCHED in layout (same ghost-button swap). | 2 | 0 | 0 | 1 |
| `33_app-states__push-permission` | MATCHED in layout (Bell disc, 'Know the moment a door opens.', Turn on notifications, Maybe later). | MOSTLY MATCHED. | 1 | 1 | 0 | 1 |
| `33_app-states__slow-connection` | MATCHED in layout (muted banner with Signal icon plus three skeleton rows). | MATCHED in layout. | 1 | 1 | 0 | 1 |
| `33_app-states__something-went-wrong` | MOSTLY MATCHED. | MOSTLY MATCHED. | 1 | 2 | 0 | 1 |
| `34_for-companies__default` | PARTIAL (live 1867px vs ref 2658px). | PARTIAL (5182px vs 7414px). | 3 | 8 | 1 | 2 |
| `35_employer__default` | LAYOUT MATCHES, CONTENT DIFFERS (900/900px, 5.2% mismatch). | Same structure (2252px vs 2520px; | 4 | 1 | 0 | 2 |
| `35_employer__just-joined` | LAYOUT MATCHES, CONTENT DIFFERS (4.2% mismatch). | Same stacked layout (2384px vs 2620px). | 4 | 1 | 0 | 1 |
| `36_admin__default` | PARTIAL (live 1707px vs ref 1123px). | PARTIAL (5638px vs 3808px). | 4 | 2 | 1 | 1 |
| `36_admin__step1-review-company-submissions-validate-doma` | NEAR PIXEL MATCH (1.7%). | NEAR PIXEL MATCH (2.9%). | 2 | 1 | 0 | 1 |
| `37_admin-review__default` | LAYOUT MATCHES, CASES AND DECISIONS DIFFER (11.3%). | Same stacked layout (3232px vs 3476px). | 8 | 2 | 0 | 1 |
| `38_emails__default` | Layout matched: muted canvas, wordmark header with a right-aligned label, 240px rail with a white selected pill, and a rounded-3xl card (From / subject / wordmark / body … | Rail pills, card and footer geometry match. | 4 | 2 | 0 | 1 |
| `39_guidelines__default` | Kit legal layout matched: header nav with bold Guidelines, mono eyebrow, 48px title with dot, date, short-version card, 200px rail and numbered text-xl sections. | Same divergences. | 0 | 0 | 4 | 2 |
| `40_terms__default` | Kit legal layout matched (header, eyebrow, title with dot, date, short-version card, rail, numbered sections). | Same. | 0 | 1 | 0 | 2 |
| `41_privacy__default` | Kit legal layout matched. | Same. | 0 | 1 | 0 | 1 |

## Differences per screen

### `00_x__default`
- **reversal** (both) — feature `landing-kit-fidelity`: kit: Trust strip directly under the hero: top and bottom 1px border, three centred items: HeartHandshake 'No referral fees.', LockKeyhole 'Private by default.', ShieldCheck 'No job guarantees.' Web: 95px gap, 13px text, 18px … · live: No strip. · fix: Restore <section className="launch-trust-strip" aria-label="Our commitments"> with the three spans, and re-import HeartHandshake, LockKeyhole and ShieldCheck in client/src/pages/Home.tsx.
- **reversal** (web) — feature `landing-kit-fidelity`: kit: Hero height is min(740px, 100svh-170px). · live: Override in client/src/index.css:233-234: hero height:auto, flex column, image in normal flow with a negative margin and a left/right mask-image. · fix: Delete the '@media(min-width:769px){.launch-hero{height:auto...}' override (and its comment) in client/src/index.css so the verbatim kit.css hero rules apply.
- **ui** (web) — feature `landing-kit-fidelity`: kit: Side note 'YOUR NEXT CHAPTER STARTS WITH A CONNECTION.' sits 44px above the hero bottom at left:45px, fully legible. · live: The side note is pushed down by the in-flow image and partly covered: 'STARTS WITH A' is faded under the masked image. · fix: Resolved by removing the desktop hero override;
- **ui** (both) — feature `landing-kit-fidelity`: kit: Footer links: Help, Guidelines, Terms, Privacy, For companies ↗. · live: An extra 'Safety' link between Privacy and For companies. · fix: Remove the /safety footer link from Home.tsx.
- **ui** (both) — feature `landing-kit-fidelity`: kit: Header 'Sign in' (ghost) links to /sign-in, the kit sign-in page. · live: Header 'Sign in' uses <SignInButton>, whose openSignIn goes straight to /api/auth/workos/sign-in (hosted AuthKit), skipping the kit /sign-in page. · fix: Render <Button asChild variant="ghost" className="launch-signin"><Link href="/sign-in">Sign in</Link></Button> when signed out.
- **ui** (both) — feature `landing-kit-fidelity`: kit: The final CTA shows only 'Referrals are free. · live: An extra '{n} referral requests accepted on skipwait.me · participants stay private.' line when GET /api/referral-impact returns more than 0, fetched in a useEffect. · fix: Remove the impact line, its useEffect fetch and its Zod schema from Home.tsx so the page matches the PNG.
- **ui** (mobile) — feature `landing-kit-fidelity`: kit: Footer tagline 'A warmer way in. · live: The links are forced onto row 3 (max-[769px]:row-start-3!), so the footer is about 30px taller and nothing overlaps. · fix: Keep the live layout.
- **ui** (mobile): kit: FAQ heading renders 'Before youtake the next step.', a kit bug: the <br> is hidden on phones and there is no space. · live: 'Before you take the next step.' (a space before the <br>). · fix: Keep the live copy.
- **ui** (both): kit: Hero paragraph, referrer-band paragraph and first FAQ answer wrap at slightly different words. · live: Same font, size, weight and widths as the deployed kit; · fix: No change.

### `01_explore__default`
- **ui** (both) — feature `kit-placeholder-color`: kit: Search placeholder 'Company, function, or industry' is 50% ink (Tailwind preflight color-mix(currentColor 50%)), a light grey · live: Placeholder is rgb(80,80,80), from the global legacy rule `::placeholder { color: #505050; · fix: Delete the global ::placeholder override so the kit/Tailwind default applies (shared CSS, so it affects every input;
- **data** (both) — feature `company-directory`: kit: Five company cards (SkipWait, Wipro, Go Neutrinos, TCS, Merkle), each with a green 'PEOPLE OPEN TO REFERRALS' pill. · live: Cards come from the hard-coded LAUNCH_COMPANIES in client/src/lib/companies.ts. · fix: Serve the directory from a server companies table via GET /api/companies, with a per-company openToReferrals boolean computed from verified, unpaused, under-capacity referrers.
- **data** (both) — feature `company-directory`: kit: Eyebrow 'FIVE OPEN DOORS · MORE TO COME', directory pill 'PEOPLE ARE OPEN TO REQUESTS' and heading '5 companies to explore' · live: 'FIVE' is a literal string. · fix: Turn openCount from GET /api/companies into a number word for the eyebrow (FIVE for 5;
- **ui** (both) — feature `company-directory`: kit: Kit page has explicit states through route loading; · live: There are no loading or error states because the data is static · fix: Use React Query for useCompanies(): a skeleton grid while pending, an inline error with Try again on failure, and the kit 'No matching doors yet' / 'Try a wider search.' block for zero results.
- **reversal** (both) — feature `explore-kit-polish`: kit: No-results 'Request a company' button links to /invite (kit: 'Bring a company to SkipWait'). · live: Links to /suggest-company. · fix: Point the no-results 'Request a company' link to /invite, as in the kit.
- **ui** (both) — feature `explore-kit-polish`: kit: Kit head: pageMeta('Explore companies', 'Find people open to referral requests at SkipWait, Wipro, Go Neutrinos, TCS, and Merkle.') · live: No applySeo call and no shared/publicRoutes entry for /explore, so the generic site title shows · fix: Call applySeo({title:'Explore companies', description built from the listed company names, path:'/explore'}) and add a publicRoutes entry.

### `02_explore-skipwait__default`
- **data** (both) — feature `company-directory`: kit: Hero pill 'PEOPLE OPEN TO REFERRAL REQUESTS' · live: Static text driven by getLaunchCompany(slug), with no availability data · fix: Load the company from GET /api/companies/:slug and render the pill only when openToReferrals is true;
- **reversal** (both) — feature `explore-kit-polish`: kit: Pill reads exactly 'PEOPLE OPEN TO REFERRAL REQUESTS'. · live: When /api/jobs lists roles for the company, the pill appends ' · N OPEN ROLE(S) LISTED'. · fix: Remove the pill suffix and the CompanyRoles block from the door page so it matches the kit.
- **ui** (both) — feature `company-directory`: kit: An unknown slug throws notFound() and renders the root 404, 'This door doesn't lead anywhere.' · live: Renders an in-shell 'This door isn't open yet. · fix: When GET /api/companies/:slug returns 404 (unknown or hidden company), render the existing NotFound page.
- **ui** (both) — feature `explore-kit-polish`: kit: Kit head: 'Referrals at {name}' / 'Request a free, private introduction to someone at {name}.' · live: No per-company title or description · fix: Call applySeo with the kit title and description once the company has loaded.

### `02_explore-skipwait__step1-ask-for-a-referral`
- **ui** (both) — feature `kit-placeholder-color`: kit: #job-url placeholder 'https://company.com/jobs/...' at 50% ink · live: rgb(80,80,80), from the global ::placeholder rule · fix: Remove the global ::placeholder override.
- **data** (both) — feature `ask-drafts`: kit: Eyebrow 'REQUEST TO SKIPWAIT': the role link is meant to be for this company · live: Continue only checks isValidTargetRoleUrl, so a link to any other employer passes. · fix: On Continue, call the existing POST /api/job-link/preview.
- preview scaffolding not shipped: 1 item(s)

### `02_explore-skipwait__step2-continue`
- **ui** (both) — feature `kit-placeholder-color`: kit: #fit-note placeholder 'Share 2–3 relevant strengths or outcomes. · live: rgb(80,80,80), from the global ::placeholder rule · fix: Remove the global ::placeholder override.
- **ui** (both) — feature `explore-kit-polish`: kit: The Review step always reads 'Job link + fit note + privacy choices' with a 'Ready' (Sparkles) pill · live: With an empty note it reads 'Job link + privacy choices · add your fit note next' with a 'Draft' (PenLine) pill · fix: Disable Continue on 'Your fit' until the note is non-empty (trimmed;
- **data** (both) — feature `ask-drafts`: kit: 'Preview request' (Send icon) opens the kit completion panel: check badge, h2 'Your request is ready.', a paragraph, 'See request tracking' (to /requests) and 'Write a full ask' (to /ask). · live: 'Preview request' closes the dialog and navigates to /ask with a sessionStorage prefill. · fix: Persist a server-side ask draft (POST /api/ask-drafts), then show the kit completion panel without the 'DESIGN PREVIEW' eyebrow and with a truthful paragraph.
- **ui** (both) — feature `explore-kit-polish`: kit: Kit inputs are uncontrolled inside a conditionally mounted dialog, so reopening 'Ask for a referral' starts empty at Role · live: url, note and urlError live in RequestDialog, which stays mounted, so reopening restores the previous link and note · fix: Reset url, note and urlError when 'Ask for a referral' opens the dialog (except when resuming after sign-in).
- preview scaffolding not shipped: 1 item(s)

### `03_sign-in__default`
- **ui** (both) — feature `sign-in-intent-routing`: kit: Footer reads 'By continuing, you agree to the Terms and acknowledge the Privacy Policy...' with Terms and Privacy Policy in plain muted text, not underlined. · live: Terms and Privacy Policy are <Link className="underline">, underlined. · fix: Keep the links (/terms, /privacy) but style them text-inherit with no underline at rest and underline on hover or focus, so the pixels match the PNG and the legal pages stay reachable.
- **data** (both) — feature `sign-in-intent-routing`: kit: 'Find a referral' / 'Give a referral' choose how you use SkipWait. · live: The intent state only swaps the context-strip copy. · fix: Carry intent through every continuation: Google, email+password and Create account.
- **data** (both) — feature `sign-in-intent-routing`: kit: 'Continue with Google' goes straight to Google. · live: Calls startLogin() → /api/auth/workos/sign-in → hosted AuthKit chooser, where the person must pick Google again. · fix: Add GET /api/auth/workos/google (provider 'GoogleOAuth', same signed state and return cookie as /sign-in) and point the button at it, carrying intent and returnTo.
- **ui** (both) — feature `sign-in-intent-routing`: kit: 'New to SkipWait? Create a free account' starts account creation. · live: Calls startLogin() → /api/auth/workos/sign-in (screenHint sign-in). · fix: Navigate to /api/auth/workos/sign-up?intent=…&returnTo=…;
- **ui** (web): kit: Story paragraph wraps '...ready to ask for—or / offer—a real introduction.' · live: Wraps '...ask for—or offer / —a real introduction.' · fix: Optional: wrap 'offer—a' in a white-space:nowrap span so the line breaks before 'offer' as in the PNG.

### `03_sign-in__step1-continue-with-email`
- **data** (mobile) — feature `password-auth`: kit: 'Password' label and .auth-input with a LockKeyhole icon, type=password, placeholder 'Enter your password', autocomplete current-password, minLength 8, required, and a ghost icon button with Eye/EyeOff and aria-label Sho… · live: No password field. · fix: Port the kit field verbatim into client/src/pages/SignIn.tsx and submit email and password to the new POST /api/auth/password/sign-in.
- **data** (mobile) — feature `password-auth`: kit: .auth-form-meta row with a right-aligned link-variant 'Forgot password?' → /forgot-password. · live: Missing. · fix: Add the link (Button variant=link asChild → Link /forgot-password) and build the /forgot-password and /reset-password flow (feature password-auth).
- **ui** (mobile) — feature `password-auth`: kit: No helper line between the field and the Sign in button. · live: Extra muted line: 'You’ll finish signing in on the next, secure screen.' · fix: Remove the line once password sign-in ships.
- **data** (mobile) — feature `password-auth`: kit: 'Sign in →' signs the person in on this page. · live: Submit redirects to /api/auth/workos/sign-in?login_hint=<email> (hosted AuthKit). · fix: POST /api/auth/password/sign-in with {email,password,intent,returnTo}.
- **ui** (mobile) — feature `password-auth`: kit: Placeholder 'you@example.com' in a light muted grey. · live: Placeholder is #505050 from the global '::placeholder{color:#505050}' rule (client/src/index.css:180). · fix: Scope a kit override, e.g.
- **ui** (mobile) — feature `sign-in-intent-routing`: kit: Terms and Privacy Policy in plain text. · live: Underlined links. · fix: Same fix as 03_sign-in__default: no underline at rest.

### `04_onboarding__default`
- **data** (both) — feature `seeker-search-profile`: kit: Kit: the setup answers (goal, roles, level, work links, city, countries, remote, work authorization) belong to the seeker account. · live: All answers are stored only in localStorage 'skipwait-onboarding-v1' (client/src/components/onboarding/onboardingState.ts). · fix: Persist the answers via GET/PATCH /api/profile/setup.
- **data** (both) — feature `seeker-search-profile`: kit: Roles step (kit source app/src/routes/onboarding.tsx): 'Pick up to 3. · live: 'Pick up to 3.' Roles never leave the device. · fix: Save the roles to profiles.openTo and the level to profiles.experienceLevel, snapshot both onto each ask at send, show them in the referrer views, then restore the kit sentence.
- **ui** (both): kit: Roles step: once 3 roles are picked, the remaining chips are faded with disabled:opacity-40. · live: The global rule at client/src/index.css:177 turns every disabled button into a solid #e0e0e0 / #505050 chip. · fix: Global decision, not local to this page.
- **ui** (both): kit: Resume step hint 'PDF or DOCX · up to 5 MB'; · live: 'PDF, Word, PNG, JPEG · up to 10 MB'. · fix: Either move the kit limits (PDF/DOCX, 5 MB) into one shared constant used by client and server validation with the kit error copy, or keep the 10 MB limits and the copy that states them.
- **data** (both) — feature `profile-resume`: kit: Resume done state: '<file name>' / '2 pages · tap to replace'. · live: Shows the real file name with 'Uploaded · tap to replace'. · fix: Store the upload as the profile resume (profiles.defaultResumeAttachmentId) and compute pageCount for PDFs on upload.
- **ui** (both): kit: Resume step: no Remove link. · live: Adds a 'Remove' text link. · fix: Drop the Remove link (the resume is managed from Profile).
- **data** (both) — feature `credit-tools`: kit: 'No resume yet? Build one with a resume overhaul or continue — you can add it before your first ask.' The link goes to /plans. · live: 'No resume yet? Continue — you can add it before your first ask.' · fix: Restore the link to /plans once the resume-overhaul credit tool (3 credits, PRICING.md) exists.
- **data** (both) — feature `seeker-work-links`: kit: Work step: 'Optional, but asks with a work link stand out.' Each LinkedIn / GitHub / Portfolio site / Behance-Dribbble card shows a 'Connect' label and a check when connected. · live: Adds 'Add the URLs in My work.' (link to /work). · fix: 'Connect' opens an inline URL field on the card that saves to seekerProfileLinks via PUT /api/profile/links/:kind, and the card shows the check when saved.
- **data** (both) — feature `ask-role-location-fit`: kit: Location step: 'We'll warn you before asking for roles that can't work for you.' · live: 'Saved on this device. · fix: Save city (profiles.location), workCountries (ISO codes), openToRemote and workAuthorization to the account.
- **data** (both) — feature `seeker-search-profile`: kit: 'Countries you can work in' is a text input. · live: Free text, up to 240 characters, never parsed. · fix: Keep the kit input look, add typeahead over a static ISO-3166 list (names from Intl.DisplayNames, no new dependency), and store alpha-2 codes so location fit can be computed.
- preview scaffolding not shipped: 1 item(s)

### `04_onboarding__step1-skip-for-now`
- **data** (both) — feature `seeker-search-profile`: kit: 'Setup 60% complete. · live: 'Setup 60% complete. · fix: Once the answers persist server-side, remove the device clause, recompute readiness from GET /api/profile/setup, and update the honesty assertion in client/src/pages/profileSetup.test.tsx.
- **data** (both) — feature `seeker-search-profile`: kit: Kit hard-codes 'Location & authorization' as done. · live: Done only when a city or countries were entered (they are in this fixture, so it shows ✓ like the reference). · fix: Keep it data-driven: done when the server profile has a city, workCountries or a saved workAuthorization;
- **data** (both) — feature `profile-resume`: kit: The Resume row is ✓ when a resume is on the profile. · live: Done only when this device's local state holds an uploaded attachment id. · fix: Base the Resume row on profiles.defaultResumeAttachmentId.
- **data** (both) — feature `seeker-work-links`: kit: The Work links row is ✓ when at least one link is connected. · live: Done when a link kind was toggled locally, even if no URL exists. · fix: Count seekerProfileLinks rows (or pinned work items) for the signed-in seeker.

### `05_ask__default`
- **data** (both) — feature `ask-company-context`: kit: Eyebrow 'NEW ASK · WIPRO · DESIGN'. · live: 'NEW ASK'. · fix: Resolve the company from askPrefill.companySlug (client/src/lib/askPrefill.ts, already written by /explore/:slug), /ask?company=<slug>&function=<Function>, or the job-link preview companyName.
- **data** (both) — feature `ask-company-context`: kit: Job link placeholder 'https://careers.wipro.com/…'. · live: 'https://careers.company.com/…'. · fix: Use 'https://careers.{companyDomain}/…' when the company is known;
- **ui** (both): kit: No compensation field. · live: Shows a 'Compensation (optional)' input (placeholder 'e.g. · fix: Remove it from the composer (the PNG wins).
- **data** (both) — feature `ask-role-location-fit`: kit: 'Role location' select (Remote · India / Hybrid · Bengaluru / On-site · USA (no sponsorship)) and the 'Location works for you' check. · live: Absent. · fix: Build the select options from the job-link preview locations (JSON-LD JobPosting) plus options derived from the profile (Remote · <first work country>, Hybrid · <city>) plus 'Other location…'.
- **data** (both) — feature `ask-role-location-fit`: kit: Mismatch callout (Globe2, muted box): 'This role needs US work authorization. · live: Absent. · fix: Render it when fit === 'needs_sponsorship', with the country name from the role location.
- **data** (both) — feature `ask-coach-rewrite`: kit: Outline button 'Improve my note · 1 credit' (Sparkles). · live: 'Draft from my resume'. · fix: POST /api/ask-coach/rewrite spends 1 credit through the ledger;
- **data** (both) — feature `profile-resume`: kit: Attached: a static muted chip 'Resume (shared after accept)' (FileText, bg-muted, no border). · live: A bordered 'Add resume (shared after accept)' file picker, then '<file> (shared after accept)' with an X. · fix: When the profile has a resume, show the kit chip and send it (the server clones the attachment per ask).
- **data** (both) — feature `ask-pinned-work`: kit: Pinned work chip (Pin icon, border-primary, bg-primary/5, X to unpin) titled with a work item. · live: Absent. · fix: Load GET /api/work-items and preselect the seeker's pinned items as chips;
- **data** (both) — feature `ask-pinned-work`: kit: Strength panel has 5 segments and 5 checks (Official job link, 30–120 words, One specific proof of fit, Relevant work attached, Location works for you). · live: 4 segments and 4 checks; · fix: Restore the kit's 5 checks and thresholds in AskStrength, backed by pinned work and location fit.
- **data** (both) — feature `ask-pinned-work`: kit: Lightbulb: 'The referrer sees your role, note, and pinned work — not your name or resume — until they accept.' · live: 'The referrer sees your role and note — not your name or resume — until they accept.' · fix: Restore the kit copy once pinned work is snapshotted onto asks and rendered in the pre-accept referrer views.
- **data** (both) — feature `kit-pricing`: kit: Footnote 'Uses 1 of your 3 open slots · referrals are always free'. · live: 'Uses 1 credit · referrals are always free'. · fix: Switch asks to plan open-slot caps (Free 3 / Start 8 / Momentum 15 / Land 30/50/unlimited).
- **ui** (both): kit: Disabled 'Send ask' is faded primary rgb(126,127,255) with a grey rgb(136,136,136) offset shadow. · live: Solid #e0e0e0 / #505050 with an ink border and no shadow, from client/src/index.css:177 and .brand-button:disabled at :206. · fix: Global conflict with DESIGN.md:46 ('no opacity-faded disabled states').
- **ui** (both): kit: Input and textarea placeholders are muted grey, about rgb(137,137,137). · live: #505050 from the global '::placeholder' rule at client/src/index.css:180. · fix: Shared change: the placeholder token should match the kit's muted-foreground placeholder.
- **ui** (both): kit: The reference is captured in the signed-out shell (header 'Sign in') with the full composer visible. · live: Signed out, live shows only the heading, the subtitle 'Compose below after signing in — referrers decide…' and a primary 'Sign in to ask' button (data-skipwait-screen=ask-sign-in). · fix: Render the composer to signed-out visitors and keep the draft (url, note) in sessionStorage.
- **data** (both) — feature `kit-pricing`: kit: Sent state (kit source): 'Ask sent to Wipro.' / 'Verified Wipro referrers in Design will see it. · live: client/src/components/ask/AskSent.tsx: 'Ask sent to <companyDomain>.' / '…and your credit returns.' / 'Open asks: <pending count>'. · fix: Use the company display name and the function (ask-company-context, function-taxonomy) and the slot wording.
- **data** (both) — feature `ask-quality-checks`: kit: CHECKLIST.md:65 and FOR_AI_BUILDERS: ask quality checks also run server-side, and location fit uses the seeker's work authorization against the role location. · live: Checks are client-only (client/src/components/ask/AskStrength.tsx). · fix: Move the checks to shared/askQuality.ts.
- preview scaffolding not shipped: 1 item(s)

### `06_requests__closed`
- **ui** (both): kit: 'SkipWait', mark 'SW' · live: 'skipwait.me', mark 'S' · fix: companyIdentity() for name and initials (SkipWait is in the launch list).
- **data** (both) — feature `pass-reasons`: kit: 'Not my team · slot freed': the pass reason's short label, plus 'slot freed' on closed asks · live: 'Not my team · Ref-1045' (fixture referrerMessage free text; · fix: Show the server's declineReasonLabel and append ' · slot freed' for declined, expired and withdrawn rows once the slot model is live (kit-pricing).

### `06_requests__default`
- **reversal** (both) — feature `kit-pricing`: kit: Meter 'OPEN SLOTS · FREE 2/3' counts open (pending) asks against the plan's open-request cap; · live: slotMeter() shows monthlyCreditsRemaining/monthlyAllowance (1/3), so it fills unreserved credits, the inverse of the kit. · fix: RequestSummary/slotMeter in client/src/components/requests/requestModel.ts: open = slots.open (pending, unexpired asks) and allowance = slots.cap from the new slots payload;
- **reversal** (both) — feature `kit-pricing`: kit: 'Track every ask in one place. · live: '… Withdrawn or expired asks free a slot.' · fix: Use the kit text once slots free on answer, pass, expiry or withdraw (HEADING in MyRequests.tsx).
- **ui** (both): kit: 'Wipro · Message your referrer', mark 'W'; · live: 'wipro.com · Message your referrer · Ref-1041'; · fix: RequestRow: use the existing companyIdentity() (inboxThreads.ts) or companyName/companyInitials (threadModel.ts) for the name and initials.
- **ui** (both): kit: No support reference in the row · live: ' · Ref-1041' suffix on every row (displayRef) · fix: Drop the Ref-#### suffix from RequestRow.
- **ui** (both): kit: Row is one link card: pill + arrow only. · live: Red 'Withdraw' link-button plus AlertDialog under the Requested pill, and the withdraw error/retry alert on the list · fix: Remove the inline withdraw from RequestRow and MyRequests.
- **ui** (both): kit: No extra line under the meter; · live: Meter can render '+N one-time credits · Renews <date>'. · fix: Remove the extras line from RequestSummary and the showUpdate aside from RequestRow (the referrer's note reaches the inbox and thread instead).
- **data** (both) — feature `interview-dossier`: kit: Interviewing row note 'Go Neutrinos · Prepare with a dossier' · live: 'goneutrinos.com · Updated Oct 6 · Ref-1044' · fix: After the interview-dossier tool exists, requestNote() returns 'Prepare with a dossier' for interview and offer rows.
- **ui** (mobile): kit: Each row's second line is 1 line · live: 2–3 lines (domain + Ref + stacked Withdraw) · fix: Fixed by the name, Ref and Withdraw changes above.
- preview scaffolding not shipped: 1 item(s)

### `06_requests__first-time`
- **reversal** (both) — feature `kit-pricing`: kit: 'OPEN SLOTS · FREE 0/3', all segments empty · live: '3/3', all segments filled · fix: Same slot-meter change as in default (open asks / cap).
- **ui** (both): kit: Nothing below the muted empty panel · live: ZeroActivityShareCard (6 share buttons) under the panel · fix: Remove the ZeroActivityShareCard render from RequestsEmpty (RequestStates.tsx).
- preview scaffolding not shipped: 1 item(s)

### `06_requests__slots-full`
- **reversal** (both) — feature `kit-pricing`: kit: 'OPEN SLOTS · FREE 3/3', all segments filled; · live: 0/3 empty bar; · fix: full = slots.open >= slots.cap (cap null = unlimited, never full).
- **data** (both) — feature `kit-pricing`: kit: 'All 3 slots are in use. · live: 'All 3 slots are in use. · fix: slotsFullCopy(): use the kit sentence with nextPlan.label and nextPlan.openAskCap from the kit plan catalog.
- preview scaffolding not shipped: 1 item(s)

### `07_inbox__default`
- **reversal** (both): kit: No review-queue card; · live: 'Review queue · N new asks waiting / Decide as a referrer — your identity stays hidden.' link card to /queue above the tabs · fix: Remove the queueCount card from UnifiedInbox.tsx.
- **ui** (both): kit: Filter buttons min-h-9 (pill row 44px) · live: min-h-11 (pill row 52px) · fix: SIDES buttons: min-h-9 as in the kit.
- **data** (both) — feature `referrer-identity-reveal`: kit: Accepted and referred seeker rows: 'Rahul K. · live: 'Your referrer · Wipro', 'Your referrer · TCS' (the /mine payload has no referrer name) · fix: askingThread(): who = `${referrer.displayName} · ${company}` when the payload carries a referrer;
- **data** (both) — feature `inbox-list-enrichment`: kit: Hidden-seeker row: 'UX Researcher · New ask for you to review' · live: 'Wipro · New ask for you to review' (the /inbox rows carry no job title) · fix: Add title to the /inbox select;
- **data** (both) — feature `thread-timeline`: kit: Accepted row highlighted (unread) with the last message 'Happy to help — I'll submit this week.', '10m'; · live: Preview comes from referrerMessage or an 'N new messages' count; · fix: Use lastActivity.text as the note and lastActivityAt for the time;
- **data** (both) — feature `mark-referred-reference`: kit: 'Referred! Reference ID TC-4410' · live: Only possible as free text in referrerMessage · fix: The referenceId recorded on mark-as-referred becomes the timeline event 'Referred! Reference ID {id}'.
- preview scaffolding not shipped: 2 item(s)

### `07_inbox__empty`
- **ui** (both): kit: Filter buttons min-h-9 · live: min-h-11 · fix: min-h-9 (same fix as default).
- preview scaffolding not shipped: 1 item(s)

### `08_thread__default`
- **data** (both) — feature `function-taxonomy`: kit: Eyebrow 'DESIGN · WIPRO' · live: 'WIPRO' · fix: ThreadMain eyebrow = `${jobFunction} · ${company}` when jobFunction is present.
- **data** (both) — feature `referrer-preview-expiry`: kit: 'Expires in 6 days. · live: 'No reply needed to pass — but a quick answer helps.' (the preview has no createdAt or expiresAt; · fix: Prefix with askDaysLeft from the preview's expiresAt ('Expires today/tomorrow/in N days.').
- **data** (both) — feature `pre-accept-question`: kit: Outline 'Ask one question' button (HelpCircle) between Accept & connect and Pass privately; · live: Button and flow absent (no server primitive before accept) · fix: Add the button, modal and system line to ReferrerPanel (ThreadDecisionPanels.tsx), wired to the new question endpoints.
- **reversal** (both) — feature `pass-reasons`: kit: Pass modal: 'The seeker sees a kind note with your reason. · live: 'The seeker sees a kind note. · fix: Use the kit copy and send the kit reason code once pass-reasons ships.
- **data** (both) — feature `mark-referred-reference`: kit: Mark as referred modal: 'Optional: add your portal's reference so the seeker can mention it.' + 'Reference ID (optional)' input · live: 'Tell the seeker you submitted this through your company's process.' with no input · fix: Add the kit copy and input;
- preview scaffolding not shipped: 1 item(s)

### `08_thread__referrer-view`
- **data** (both) — feature `function-taxonomy`: kit: 'DESIGN · WIPRO' · live: 'WIPRO' · fix: As default.
- **data** (both) — feature `referrer-preview-expiry`: kit: 'Expires in 6 days.' prefix · live: missing · fix: As default.
- **data** (both) — feature `pre-accept-question`: kit: 'Ask one question' button · live: missing · fix: As default.
- preview scaffolding not shipped: 1 item(s)

### `08_thread__step1-seeker-view`
- **data** (both) — feature `function-taxonomy`: kit: 'DESIGN · WIPRO' · live: 'WIPRO' · fix: As default.
- **ui** (both): kit: Clock3 icon in the seeker waiting line has no shrink-0 (renders small next to wrapped text) · live: 'size-4 shrink-0' (16px) · fix: Drop shrink-0 on that icon in ThreadMain to match (cosmetic).
- **ui** (both): kit: Kit source: seeker at Accepted gets only 'Use messages to coordinate…'; · live: SeekerPanel shows progress buttons from Accepted; · fix: SeekerPanel: no progress buttons at Accepted;
- **data** (both) — feature `referrer-identity-reveal`: kit: After accept: REFERRER card 'Rahul K. · live: Seeker always sees 'Someone at {company}'; · fix: Render referrer.displayName and title, plus the resume file name and profile chip, from the new payload fields.
- **data** (both) — feature `interview-dossier`: kit: 'Prepare with an interview dossier →' under 'Update your progress' · live: absent · fix: Link to the dossier tool once it exists.
- preview scaffolding not shipped: 1 item(s)

### `08_thread__step3-accept-connect`
- **reversal** (both) — feature `referrer-identity-reveal`: kit: 'You'll both see names, and you'll get the resume.' · live: 'You'll see their name, and you'll get the resume.' · fix: Use the kit copy once the seeker is shown the referrer's name after accept.
- **ui** (both): kit: Disabled Accept = faded primary (kit disabled:opacity-50) · live: Global grey disabled style (index.css button:disabled !important) · fix: Conflicts with DESIGN.md ('no faded disabled controls').
- **ui** (both): kit: Native 16px checkbox (mt-1 size-4) · live: 18px from the .app-dialog input rule · fix: Make the .app-dialog checkbox 16px, or exempt this dialog.
- **data** (both) — feature `referrer-identity-reveal`: kit: Checkbox confirmation gates Accept · live: Gate is client-only; · fix: Send ethicsConfirmed:true with the accept;

### `09_alerts__default`
- **ui** (both): kit: Rows in feed order with no unread-first rule (kit seed: 'Your ask was accepted' 12 min, then 'New message' 10 min) · live: orderNotifications() sorts unread first, then newest first (client/src/components/alerts/notifications.ts) · fix: Sort purely by createdAt desc inside each Today/Earlier group, because the kit has no unread-first rule and the Unread filter covers that.
- **data** (both) — feature `notification-kinds`: kit: 'Ask expires in 1 day' row uses the Clock3 icon. · live: Icon is chosen from the category (status, message, referral, system), so the expiry row shows Check · fix: Serialize a notification kind from the server and map kind to icon in NotificationGroups.tsx.
- **data** (both) — feature `notification-kinds`: kit: Rows link per event: accepted, message and expiring go to the thread; · live: destinationFor() is category-based: status goes to /requests, system to /settings (wrong for credit rows), referral to /inbox or /requests · fix: Store an app-relative href per notification, return it from GET /api/notifications, and navigate to it after the mark-read POST.
- **data** (both) — feature `notification-kinds`: kit: Copy: 'Your ask was accepted' / 'A verified referrer at Wipro accepted · Product Designer'; · live: Server generators write 'Referral Request approved' / 'A verified employee accepted your private referral request.' (server/db.ts:1652, 1983), 'New private referral message' / generic body (db.ts:2072… · fix: Fix the generators, not the client: kit titles and bodies built from company display name, job title and a message excerpt, with the right kind and href.
- **data** (both) — feature `notification-reminder-jobs`: kit: 'Ask expires in 1 day · TCS · Data Analyst — refresh your note or let it go' and '6 plan credits expire Friday · Use them on an interview dossier or mock interview' · live: Never generated. · fix: Add scheduled reminder jobs: ask expiring 24h before getAskExpiresAtMs, and plan-credit lots expiring (needs kit-pricing rollover lots).
- **ui** (mobile): kit: All/Unread buttons min-h-9 (36px); · live: min-h-11 md:min-h-9 and min-h-11 md:min-h-8 (Alerts.tsx:137,140), so the toolbar is about 8pt taller · fix: Render at the kit's 36px visual height and keep the 44px hit area with an absolutely positioned ::before (inset -4px) so the PNG and the tap-target rule both hold.
- preview scaffolding not shipped: 1 item(s)

### `09_alerts__empty`
- **reversal** (both): kit: 'When a referrer replies or a new one opens at your alert companies, it lands here.' · live: 'When a referrer replies or a new one opens at a company you're waiting on, it lands here.' (Alerts.tsx:155) · fix: Restore the kit copy verbatim.
- **ui** (both): kit: Mark all read shown as a ghost text button with the CheckCheck icon · live: With 0 unread the button is disabled, and global button:disabled paints it a #e0e0e0 filled pill · fix: When unread is 0, render the ghost button with aria-disabled="true" and a no-op handler (not the native disabled attribute), or exempt variant=ghost from the global disabled fill.
- preview scaffolding not shipped: 1 item(s)

### `09_alerts__saved-alerts`
- **data** (both) — feature `saved-alerts`: kit: Row title '<Company> · <Function>' (Merkle · Design) · live: Row title is the watched domain only. · fix: Add a function to alerts and resolve the display name from the company directory.
- **data** (both) — feature `company-directory`: kit: Company mark uses directory initials ('SW' for SkipWait, 'M' for Merkle) · live: domainInitials('skipwait.me') gives 'S' · fix: Server returns companyName, slug and initials from a shared company directory.
- **data** (both) — feature `saved-alerts`: kit: Subtitle 'Instant · push and email' (or 'Paused') · live: 'Watching · instant' or 'Notified — door open' (SavedAlerts.tsx:17) · fix: Build the subtitle from the user's real delivery channels for the alert-match type ('Instant · push and email', 'Instant · email', 'Instant · in-app only').
- **reversal** (both): kit: Footnote 'Free: 3 alerts · Momentum and Land: unlimited' · live: 'Free accounts keep 3 alerts (2 used).' / 'Your plan allows unlimited alerts.' (SavedAlerts.tsx:82) · fix: Ship the kit footnote verbatim and keep the cap enforced server-side by plan.
- **data** (both) — feature `saved-alerts`: kit: '+ New alert' opens a Panel with a 2-column grid: Company select (directory) + Function select (Engineering, Product, Design, Data, Operations), then Cancel + Save alert · live: Single free-text 'Company domain' input (acme.com) · fix: Replace with the kit Company and Function selects.
- **reversal** (both): kit: Empty Saved-alerts panel body 'Pick a company and function. · live: 'Pick a company. · fix: Restore the kit copy once function alerts exist.
- **data** (both) — feature `saved-alerts`: kit: Alerts fire instantly by push and email whenever a verified, discoverable referrer at company+function becomes available ('New referrer at Merkle' row on the default stem) · live: Fires once per alert (notifiedAt), only from /api/company-referrals/verify-work-email (privateReferralRoutes.ts:471,479). · fix: Use a durable per-(alert, referrer) delivery outbox fired from every discoverability transition, with function matching, kit copy, and email + web push per preferences.
- **ui** (mobile): kit: Pause and delete icon buttons size-9 · live: size-11 md:size-9 (SavedAlerts.tsx:111-112) · fix: Use visual size-9 with a 44px ::before hit area, same pattern as the All/Unread segment.
- preview scaffolding not shipped: 1 item(s)

### `10_landed__default`
- **data** (both) — feature `landed-journey`: kit: 'Product Designer at Wipro.' (mt-3 text-lg) · live: Missing. · fix: Load the seeker's hired request (status closed with a referrer) and render '{jobs.title} at {company display name}.'
- **ui** (both): kit: Separate muted paragraph 'You did the work. · live: Same sentence rendered as the mt-3 text-lg foreground line in place of the role line (Landed.tsx:32) · fix: Use the kit's two paragraphs: role line text-lg, then the muted mt-2 body.
- **ui** (both): kit: Kit Button 'Thank your referrer →' (text-sm medium, offset shadow) · live: .brand-button with larger bold type (Landed.tsx:33) · fix: Use Button from @/components/kit/button across Landed.
- **data** (both) — feature `landed-journey`: kit: Celebration state for a real hire · live: Static page reachable with no hire and while signed out · fix: Gate on sign-in.
- preview scaffolding not shipped: 1 item(s)

### `10_landed__step1-thank-your-referrer`
- **data** (both) — feature `landed-journey`: kit: 'Say thanks to Rahul.' · live: 'Say thanks.' (Landed.tsx:40) · fix: Use the referrer's first name, which is revealed after accept, from the landed endpoint.
- **reversal** (both): kit: Subtitle 'The single message referrers remember most.' · live: Adds 'Copy it into your conversation — or message from your requests.' · fix: Restore the kit subtitle.
- **data** (both) — feature `landed-journey`: kit: Draft 'Thank you for taking a chance on my ask. · live: 'Thank you for taking a chance on my ask — I really appreciate you opening the door.' · fix: Build the kit draft from the real start date ('I start on the {ordinal day}').
- **data** (both) — feature `thank-you-wall`: kit: Checked-by-default checkbox 'Let Rahul add this to his private thank-you wall' (primary filled box with Check) · live: Missing. · fix: Add the toggle, bound to shareOnWall in the thanks POST.
- **ui** (both): kit: Gift note in kit Panel tone="muted" mt-6 · live: Custom div mt-3 rounded-2xl p-4 (smaller and tighter) · fix: Use Panel tone="muted" className="mt-6 text-sm" from @/components/kit/preview-kit.
- **data** (both) — feature `thank-you-wall`: kit: Actions: ghost 'Skip' (go to step 2) and primary 'Send thanks' with Send icon (sends the note) · live: Outline 'Open my requests' link and 'Copy thanks' clipboard copy (Landed.tsx:47-48) · fix: 'Send thanks' POSTs the note (message into the referral thread plus a thank-you record), then advances.
- **ui** (mobile): kit: Single-line Skip and Send thanks in a justify-between row · live: Both buttons wrap to two lines at 390px · fix: Fixed by using the kit Button (text-sm) and the kit's ghost Skip.
- **ui** (mobile): kit: Textarea min-h-36 · live: rows={5} plus min-h-36 makes it about 10pt taller · fix: Drop rows={5}.
- preview scaffolding not shipped: 1 item(s)

### `10_landed__step2-send-thanks`
- **data** (both) — feature `landed-journey`: kit: 'Once you have your Wipro email, …' · live: 'Once you have your new work email, …' (Landed.tsx:57) · fix: Interpolate the hired company's display name.
- **reversal** (both): kit: 'verify in 30 seconds'; · live: 'verify in under a minute'; · fix: Restore the kit text verbatim.
- **data** (both) — feature `landed-journey`: kit: Outline 'Remind me after I join' (records 'later', then the Done step says 'We'll check in after your start date.' / 'We'll send one reminder 30 days after you start. · live: Outline 'Back to SkipWait' link. · fix: POST the pay-it-forward choice.
- **ui** (both): kit: Kit Button outline and primary, text-sm · live: .brand-button classes (Landed.tsx:64-65) · fix: Use the kit Button variants.
- preview scaffolding not shipped: 1 item(s)

### `11_referrer__default`
- **ui** (both): kit: Kit source (no PNG for the dialog): 'Set up as a referrer' opens an in-page app-dialog 'REFERRER SETUP · 1 OF 3' with 3 steps: 1. · live: ReferrerWorkspace onSetUp navigates to /referrer-setup when signed in, or opens ReferrerSignInDialog when signed out. · fix: In client/src/pages/Referrer.tsx and components/referrer, open a kit app-dialog with the 3 steps driven by real state.
- **ui** (both): kit: The Overview tab is only the yellow callout and the 3-item control list, then the footer. · live: When signed in, signedInStatus adds blocks below the kit sections: a LoadingSkeleton, a 'Use your company email account.' card, 'Private requests at your company.' rows with 'Review candidate' buttons… · fix: Keep the Overview to the kit sections.

### `11_referrer__impact`
- **data** (both) — feature `referrer-impact-metrics`: kit: 0 introductions · 0 active conversations · 0 outcomes shared · live: 0 referrals accepted · 0 pending decisions · 0 unread messages (from /api/referrer/impact-summary) · fix: Extend GET /api/referrer/impact-summary with introductions, activeConversations and outcomesShared.
- **ui** (both): kit: CTA 'See how a request looks →' · live: CTA 'Open request queue →' linking to /queue · fix: Use the kit label and keep the /queue target, which shows real requests or the real empty state.

### `11_referrer__request-queue`
- **ui** (both): kit: No tab row. · live: ScopeTabs (New with a count badge / Saved / Done) plus an 'N of M' Previous/Next pager in the banner slot (MyCompanyInbox.tsx + QueueParts.tsx) · fix: Remove the scope tab row so the queue matches the PNG and shows routed 'new' requests.
- **data** (both) — feature `function-taxonomy`: kit: Eyebrow 'PRODUCT · WIPRO' (job function · company name) · live: Eyebrow 'WIPRO.COM · REF-1031' (raw domain · private ref) · fix: Add jobFunction to inbox rows and resolve the company display name via company-directory.
- **data** (both) — feature `ask-quality-signals`: kit: Card title 'Product Designer' (role title) · live: Card title 'Private request' · fix: Add jobTitle (jobs.title) to GET /api/company-referrals/inbox rows and use it as the h2.
- **ui** (both): kit: StatusPill 'Requested' with a Clock3 icon, sans label · live: StatusPill 'New private request' with a CircleDot icon. · fix: Map pending rows to the kit status 'Requested' (the shared/referral status labels map to kit labels) before passing it to StatusPill.
- **data** (both) — feature `identity-gated-preview`: kit: identity-locked: 'Identity hidden / Shared after you accept the request' (the seeker's identity) · live: 'Your identity stays hidden / Shared only if you accept the request'. · fix: Stop returning the seeker's name from the unclaimed preview, then use the kit copy verbatim.
- **data** (both) — feature `ask-quality-signals`: kit: Chips: 'Official job link included' · 'Relevant fit note included' · 'Resume ready after acceptance' · live: Chips: 'Official job link included' · '1 document attached' · 'Expires in 5 days' · fix: Render the kit chips from server quality flags (officialLinkIncluded, fitNoteIncluded, resumeAttached).
- **data** (both) — feature `ask-quality-signals`: kit: Blockquote fit note with a yellow left rule, quoting the seeker's note · live: Missing. · fix: Add fitNoteExcerpt (the personalPitch, trimmed to about 280 chars as plain text) to inbox rows and render the kit blockquote.
- **ui** (both): kit: No role URL line and no explanatory paragraph in the card · live: RoleLink (raw careers URL) plus a detail paragraph ('Review the candidate's note, role link, and resume…') · fix: Remove RoleLink and the detail <p> from QueueRequestCard.
- **ui** (both): kit: Footer: ghost 'Pass privately' + primary 'Open request →' (mobile: Open request full width, then Pass privately) · live: Footer: ghost 'Save for later' (Bookmark icon) + 'Open request' · fix: Replace Save for later with 'Pass privately'.
- preview scaffolding not shipped: 1 item(s)

### `11_referrer__setup-capacity`
- **ui** (both): kit: Company <select> 'Select your company' (kit select styling with chevron) · live: Read-only row 'wipro.com' + 'Verified work email' badge. · fix: Render the kit <select>.
- **data** (both) — feature `referrer-capacity-routing`: kit: Monthly request capacity and Work function are real boundaries: at capacity or outside the referrer's function, asks go elsewhere · live: referralCapacity and preferAreas are saved by PUT /api/referrer-preferences, but routing (prepareReferrerReviewEmailNotifications, availability/open) ignores both · fix: Enforce monthly capacity and function/level matching in routing (see feature).
- preview scaffolding not shipped: 1 item(s)

### `12_referrer-home__at-capacity`
- **reversal** (both) — feature `referrer-capacity-routing`: kit: 'You've hit this month's capacity.' / 'New asks go to other referrers. · live: 'You've hit your capacity.' / 'Finish what's open first. · fix: Compute used as this month's usage on the server and stop routing to at-capacity referrers.
- **ui** (both): kit: 'Adjust capacity' links to the referrer workspace (/referrer) · live: Links to /referrer-setup (the full wizard) · fix: Link to /referrer?view=setup (Setup & capacity tab).
- **reversal** (both): kit: Header aside: Verified · Wipro, outline 'Queue & settings', ghost 'Become a referrer' · live: 'Become a referrer' is hidden for verified users · fix: Always render the ghost 'Become a referrer' link to /verify, as in the PNG.
- **data** (both) — feature `thank-you-wall`: kit: Aside card 'YOUR THANK-YOU WALL · PRIVATE' with the latest note (heart icon, quote, 'Name · Role') and a 4th record metric 'Thank-yous' · live: 'INVITE A COLLEAGUE' card in that slot; · fix: Back the wall and the Thank-yous count with the thank-you-wall feature and remove the invite card from this slot.
- preview scaffolding not shipped: 1 item(s)

### `12_referrer-home__default`
- **reversal** (both): kit: Ghost 'Become a referrer' in the header aside · live: Hidden when verified · fix: Always render it, linking to /verify.
- **data** (both) — feature `ask-quality-signals`: kit: Row: 'Product Designer' / 'Design · ask strength: Strong' · live: Row: 'Private ask · Ref-1031' / 'Wipro · 1 file attached' · fix: Render jobTitle, jobFunction and askStrength from the extended inbox payload or GET /api/referrer/home.
- **ui** (both): kit: Row links to the request (kit /thread) · live: Row links to /conversation/:id?from=inbox. · fix: Link rows to /queue?request=:id and make the queue open that request's card or preview from the param.
- **data** (both) — feature `thank-you-wall`: kit: YOUR THANK-YOU WALL · PRIVATE (latest note) + 'Thank-yous' metric · live: INVITE A COLLEAGUE card; · fix: thank-you-wall feature;
- **data** (both) — feature `referrer-capacity-routing`: kit: '2/3 Capacity left this month' · live: Left = capacity − active load (claimed and approved, or with unread messages), not monthly usage · fix: Read capacity.usedThisMonth and capacity.left from GET /api/referrer/home.
- preview scaffolding not shipped: 1 item(s)

### `12_referrer-home__new-referrer`
- **data** (both) — feature `thank-you-wall`: kit: Wall card empty state: 'Notes from people you help will live here. · live: INVITE A COLLEAGUE card; · fix: Render the wall from GET /api/referrer/thank-yous (empty state when total=0) and add the Thank-yous metric.
- **reversal** (both): kit: Ghost 'Become a referrer' · live: Hidden · fix: Always render it.
- preview scaffolding not shipped: 1 item(s)

### `12_referrer-home__paused`
- **data** (both) — feature `referrer-capacity-routing`: kit: While paused: New asks waiting 0, Expiring 0, list shows 'No asks right now. · live: Counts and rows come straight from the inbox even while paused. · fix: The server reports routing.state='paused', and the 'new' scope returns no routed asks for paused referrers.
- **data** (both) — feature `thank-you-wall`: kit: Thank-you wall card + Thank-yous metric · live: Invite card; · fix: thank-you-wall.
- **reversal** (both): kit: Ghost 'Become a referrer' · live: Hidden · fix: Always render it.
- preview scaffolding not shipped: 1 item(s)

### `12_referrer-home__re-verify-due`
- **reversal** (both) — feature `work-email-reverify`: kit: 'Re-verify your Wipro email within 5 days to keep receiving asks.' · live: 'Re-verify your Wipro email soon to keep receiving asks.' (a client-only nudge 76 days after workEmailVerifiedAt; · fix: Read reverify.daysLeft from the server and render 'within {n} day(s)'.
- **data** (both) — feature `ask-quality-signals`: kit: Rows with role title / function · ask strength · live: 'Private ask · Ref-…' / 'Wipro · 1 file attached' · fix: Same as default.
- **data** (both) — feature `thank-you-wall`: kit: Thank-you wall + Thank-yous metric · live: Invite card; · fix: thank-you-wall.
- **reversal** (both): kit: Ghost 'Become a referrer' · live: Hidden · fix: Always render it.
- preview scaffolding not shipped: 1 item(s)

### `13_referrer-setup__default`
- **reversal** (both) — feature `referrer-capacity-routing`: kit: 'You'll only get asks for these.' · live: 'Pick the areas you can assess. · fix: Make preferAreas and preferLevels filter routing (jobs.jobFunction/jobLevel), then restore the kit line verbatim.
- **reversal** (both) — feature `named-referrer-visibility`: kit: Kit source, Visibility step (no PNG): 'Anonymous (recommended) · “Someone at Wipro · Design”. · live: '“Someone at Wipro”. · fix: Make 'named' actually publish the name and headline on the company page and /p/:handle, append the primary function to the anon label, and use the kit copy.
- **data** (both) — feature `notification-preferences`: kit: Kit source, Notifications step: 3 Toggles: 'Push when a new ask arrives', 'Email reminder before an ask expires', 'Instead, one daily summary · Fewer interruptions' · live: One Toggle 'Email when a new ask arrives', plus a note that safety notices are always sent · fix: Add the push, expiry-reminder and digest preferences with senders, then render the 3 kit toggles.
- **reversal** (both): kit: Kit source, Ready step: outline 'Share my profile' (→ /p/:handle) + 'Go to referrer home' · live: Outline 'Edit profile' (→ /profile) · fix: Use 'Share my profile' linking to /p/{handle}.

### `13_referrer-setup__step1-continue`
- **reversal** (both): kit: 'asks per month · about 15 minutes' (kit formula: max(1, round(capacity × 5)) minutes) · live: 'asks per month' · fix: Append ' · about {max(1, round(cap*5))} minutes' in SetupWizard.tsx.
- **reversal** (both) — feature `referrer-capacity-routing`: kit: 'Most new referrers start with 3. · live: 'Most new referrers start with 3. · fix: Enforce capacity in routing, then use the kit copy verbatim.

### `14_verify__default`
- **data** (both) — feature `company-directory`: kit: Company grid of real verifiable companies with their domains · live: Grid from the static client constant LAUNCH_COMPANIES (client/src/lib/companies.ts). · fix: Load the list from GET /api/companies?purpose=verify.
- **reversal** (both) — feature `work-email-hmac-storage`: kit: WE STORE: 'A one-way fingerprint of your email' · live: 'Your work email, kept private' (workEmailOtpCodes and workEmailOtpReceipts hold the plaintext email and are never purged) · fix: Store an HMAC of the email, purge plaintext and spent rows, then use the kit line verbatim.
- **reversal** (both) — feature `work-email-reverify`: kit: LEFT YOUR COMPANY?: 'Your badge is removed at the next re-check. · live: 'Pass on open requests so seekers get a kind note, then ask us through Help to remove your badge.' · fix: Build the 90-day re-check that removes the badge and returns claimed asks with a kind note, then use the kit copy.
- **reversal** (both) — feature `work-email-reverify`: kit: Kit source, Verified (done) state: 'Verified via work email · Design', 'We'll ask you to re-verify every 90 days, or sooner if your company email stops working.', outline 'View my profile' (→ /p/:handle) · live: 'Verified via work email' (no function), 'Your badge stays on your account. · fix: Show the primary function (function-taxonomy / preferAreas[0]) when set, the kit re-verify sentence once re-verification is live, and link to /p/{handle}.
- preview scaffolding not shipped: 1 item(s)

### `14_verify__step1-continue`
- **ui** (both): kit: Placeholder 'you@wipro.com' in the kit's light muted tone · live: Placeholder rendered #505050 by the unlayered global rule '::placeholder { color: #505050; · fix: Change the global placeholder rule to the kit token (muted-foreground at the kit's placeholder tone, checked for AA).
- preview scaffolding not shipped: 1 item(s)

### `14_verify__step2-send-code`
- **reversal** (both) — feature `otp-policy-kit`: kit: 'Resend in 0:30' · live: 'Resend in 1:00' (the server limits sends to 1 per email per fixed 60s window, plus 3 per 10 min) · fix: Use a 30s server cooldown that returns retryAfterSeconds, and set the client RESEND_SECONDS from the response.
- **reversal** (both) — feature `otp-policy-kit`: kit: Kit lockout state: 'Too many tries. · live: 'Too many tries. · fix: Add a server-side 15-minute lockout after 5 failures that returns lockedUntil and attemptsRemaining, then use the kit copy.
- **ui** (both): kit: Disabled 'Verify' is the faded primary (blue at reduced opacity). · live: Grey #e0e0e0 with dark text and border, from 'button:disabled {… !important}' (client/src/index.css:177). · fix: This conflicts with AGENTS.md ('no faded disabled controls'), and the rule is global, not a recorded founder call.
- preview scaffolding not shipped: 1 item(s)

### `15_invite__default`
- **data** (both) — feature `company-demand`: kit: 'Work function' label + <select> 'Choose a function' (Engineering / Product / Design / Data / Operations) · live: No function field. · fix: Add an optional jobFunction (shared taxonomy) to the seeker demand signal and render the kit select.
- **data** (both) — feature `company-demand`: kit: Any seeker can signal demand for a company · live: createCompanySuggestion rejects a second seeker's request for an already-suggested company with 400 'This company was already suggested and is under review', so the demand signal is lost · fix: Record a per-user demand vote (idempotent per user and company) instead of rejecting duplicates.
- **data** (both) — feature `company-directory`: kit: Company datalist of companies on SkipWait · live: Datalist and 'already has a door' check use the static LAUNCH_COMPANIES · fix: Source the datalist and the listed check from GET /api/companies.
- **ui** (both): kit: Light kit placeholder 'Search or enter a company' · live: #505050 placeholder from the global ::placeholder rule · fix: Same global placeholder token fix as /verify.
- **ui** (both): kit: Kit source, 'Invite someone inside' mode (no PNG): share-link row (link text + copy icon) and a single primary 'Email invite' button · live: Same row with the real personal link (origin/verify?invite=…), plus an extra outline 'Share' button and a 'One link per person…' paragraph · fix: Keep the real personal link in the share-link row.
- preview scaffolding not shipped: 1 item(s)

### `16_profile__default`
- **reversal** (both) — feature `profile-fields-relocation`: kit: profile-form holds only Display name, Headline, Resume upload-field (seeker) and the full-width Save button · live: Same form plus Current title, Location, Bio (textarea), Skills, Open to (comma separated, up to 5) with hint, Profile handle (skipwait.me/p/ prefix + hint), 'Copy profile link' button, WHO CAN SEE THI… · fix: Cut ProfileForm.tsx down to the kit fields.
- **data** (both) — feature `profile-display-name`: kit: Display name is an editable input · live: Read-only input showing users.name, with the hint 'From your sign-in account.' underneath (users.name is overwritten by upsertUser on every sign-in) · fix: Make the input editable and save it to a new profiles.displayName override.
- **data** (both) — feature `profile-resume`: kit: Resume upload-field with an outline 'Choose file' button (picks a file; · live: Same field, but the button is 'Attach with an ask' linking to /ask. · fix: 'Choose file' opens a hidden file input and uploads through the existing chunked upload with purpose 'profile_resume'.
- **data** (both) — feature `blocking`: kit: Privacy row 3: 'Block and report available' / 'Leave a conversation without losing access to support.' · live: 'Report available' / 'Report a conversation without losing access to support.' · fix: Restore the kit copy in PrivacyControls.tsx once blocking ships, in the same release.
- **reversal** (both): kit: Aside has exactly three rows plus 'Review safety boundaries' · live: Extra 'Verified at <domain>' / 'Your email is never shown to seekers.' row when work email is verified · fix: Remove the row.
- **ui** (both): kit: Row 1 'Not publicly discoverable' / 'Only referrers reviewing your ask see context.' (private default) · live: Same text for private. · fix: No change.
- **data** (both) — feature `showcase-plan-limits`: kit: 'View public profile →' is always shown · live: Hidden when the profile has no handle · fix: Assign every profile a handle automatically (custom handles become the plan perk), then always render the button linking to /p/<handle>.
- **ui** (mobile) — feature `profile-resume`: kit: Resume icon is vertically centred against the title and description block, and Choose file is full width beneath · live: Icon sits about 20 device px lower than the text block (grid gap from the extra 'grid gap-[7px]' utility on .upload-field) · fix: Drop the extra 'grid gap-[7px] text-xs font-semibold' utilities in ProfileForm.tsx so kit .upload-field alone governs layout.
- **ui** (web): kit: Topbar 'Sign in' and sidebar footer 'Sign in' button (the kit renders the signed-out shell) · live: Signed-in shell: bell and avatar in the topbar, bell and avatar icons in the sidebar footer · fix: None in this cluster (AppShell chrome, owned by the shell auditors).
- preview scaffolding not shipped: 2 item(s)

### `16_profile__step2-referrer-profile`
- **reversal** (both): kit: Company select with no helper text · live: Helper line 'Companies come from a verified work email. · fix: Remove the <small id=profile-company-hint>.
- **data** (both) — feature `referrer-profile-headline`: kit: Referrer Headline 'Your function at work' is its own value (the public referrer variant shows 'Design Lead' while the seeker variant shows 'Senior Product Designer · enterprise workflows') · live: The referrer tab edits the same profiles.headline as the seeker tab · fix: Bind the referrer tab Headline to a new profiles.referrerHeadline and save it with Save.
- **ui** (both): kit: Company select listing verified companies (kit sample options SkipWait/Wipro/Go Neutrinos/TCS/Merkle are preview data) · live: Select shows the one verified company (profiles.company || workEmailDomain), or a disabled 'Select verified company' option · fix: Keep it real-data-driven: options come only from the user's verified work-email enrollment(s), never sample companies.
- **data** (both) — feature `blocking`: kit: 'Block and report available' / 'Leave a conversation without losing access to support.' · live: 'Report available' / 'Report a conversation…' · fix: Restore the kit copy when blocking ships.
- **data** (both) — feature `profile-display-name`: kit: Display name editable, no hint · live: Read-only with 'From your sign-in account.' · fix: Same as 16_profile__default.
- **ui** (both): kit: 'Seekers see your company and function, not your name.' · live: Same for anon. · fix: No change (real-data truthful state;
- preview scaffolding not shipped: 1 item(s)

### `17_p-asha__default`
- **ui** (both) — feature `public-profile-kit`: kit: Header right: rounded-full muted segmented 'You' | 'Visitor' toggle · live: 'Manage profile' text-link (owner only) · fix: Render the toggle for the owner only.
- **data** (both) — feature `work-visibility-tiers`: kit: Owner meta line on hidden pieces: EyeOff 'Shown only in requests' · live: EyeOff 'Only visible to you' (visibility is a boolean) · fix: Label by tier: public → 'Visible on profile', askers → 'Shown only in requests', private → 'Only me'.
- **data** (both) — feature `work-import`: kit: Owner empty state: 'Add one piece you're proud of.' / 'Import from GitHub, Behance, Dribbble, Medium or your site.' / Add work · live: Second line reads 'Link a case study, project, article or code.' · fix: Use the kit copy once import ships.
- **data** (both) — feature `public-profile-kit`: kit: Referrer variant: headline is the referrer function, 'Verified at <Company> via work email' (BadgeCheck), muted blurb 'Open to referrals for <areas> roles at <Company>. · live: No variant. · fix: Server decides kind = referrer only when referrerVisibility='named' and verified.
- **reversal** (both) — feature `public-profile-kit`: kit: Hero line is the headline only; · live: Hero joins currentTitle · headline; · fix: Render the headline only and drop bio/skills/currentTitle from the page and the /api/p payload.
- **ui** (both): kit: Work card: source row, eyebrow, title, owner meta line; · live: Extra 'Open link →' text-link row when the item has a url · fix: Make the h3 title the outbound link (target=_blank rel='noopener noreferrer') and remove the extra row.
- preview scaffolding not shipped: 1 item(s)

### `18_work__default`
- **data** (both) — feature `pinned-work-in-asks`: kit: Subtitle 'Publish projects to your profile. · live: '…Pin your best so they lead your profile.' · fix: Restore the kit copy when pinned work actually travels with requests.
- **data** (both) — feature `work-import`: kit: Outline 'Import from other platforms' button (Download icon) next to Add work, opening the import sheet: source grid GitHub / Behance / Dribbble / Medium / Personal website / LinkedIn export → connect step → 'Find my wor… · live: Only the Add work button; · fix: Add the button and the kit import sheet on top of a real import pipeline.
- **data** (both) — feature `work-items-kit-fields`: kit: Principle 1: 'Nothing ranks you. · live: '…pinned pieces first.' (ordering is pinned desc, updatedAt desc) · fix: Add an owner-controlled order (position column + drag reorder in My view) and restore the kit copy.
- **data** (both) — feature `work-visibility-tiers`: kit: Principle 3: 'Public, only referrers you ask, or only you — per piece.' · live: 'Visible on your profile, or only you — per piece.' · fix: Restore the copy with the 3-tier visibility.
- **data** (both) — feature `showcase-plan-limits`: kit: Owner card: '<name>' / '<headline> · skipwait.me/<em>yourname</em>' + yellow 'Plus' plus-chip · live: '<name>' / '<headline> · skipwait.me/p/<em>asha</em>', or a 'Set your profile link' link when there is no handle; · fix: Always have a handle (auto-assigned).
- **data** (both) — feature `showcase-plan-limits`: kit: Pin meter 'N/3 pinned to requests'; · live: '2 pinned'; · fix: Show 'N/<plan max> pinned to requests' and a 'Pin limit' state at the cap, with a server-enforced pin limit per plan.
- **data** (both) — feature `work-items-kit-fields`: kit: Card eyebrow kinds from Project / Case study / Link / File or image / Write-up (e.g. · live: Server enum case_study/project/article/code/other → 'ARTICLE · FROM MEDIUM' · fix: Extend the kind enum with link/file/write_up.
- **data** (both) — feature `work-visibility-tiers`: kit: vis-chip + select options 'Public' (Globe) / 'Only referrers I ask' (Users) / 'Only me' (Lock) · live: 'Visible on profile' (Globe) / 'Only me' (Lock): boolean visibleOnProfile · fix: Use the 3-tier visibility enum with the kit labels and icons.
- **ui** (both) — feature `work-items-kit-fields`: kit: work-tools: Pin/Unpin ghost button + visibility select (max-width 60%) only · live: Extra red Trash2 delete icon button, so the select is narrower · fix: Remove the trash icon from the card.
- **ui** (both): kit: work-body: eyebrow, title, vis-chip · live: Extra 'Open link →' row when the item has a url (card 2 is taller) · fix: Make the title the outbound link and remove the row.
- **data** (both) — feature `pinned-work-in-asks`: kit: Section 'HOW IT HELPS YOUR ASK' / 'Pinned work rides along with every request.' with an ask-card (eyebrow 'REFERRAL REQUEST · PREVIEW', role · company, quoted note, pinned-work chips or muted 'No work pinned yet') · live: Section absent · fix: Render it from real data: the seeker's latest open request (role title, company, first ~90 chars of the note) plus the work actually attached.
- **data** (both) — feature `showcase-plan-limits`: kit: plus-nudge aside: Sparkles, 'Show more of what you can do' / 'Start expands your showcase. · live: Absent · fix: Show it only for plans without the unlimited showcase (Free/Start), from the real plan, dismissible for 7 days per UPGRADE_NUDGES.
- **ui** (both): kit: work-thumb and plus-nudge grounds render pink→peach / pink · live: Pale blue→yellow. · fix: Delete the legacy index.css .work-thumb/.pinned-pill rules and the h-auto! hack so kit.css alone applies.
- **data** (both) — feature `work-items-kit-fields`: kit: Add sheet: type chips Project / Case study / Link / File or image / Write-up. · live: Chips Case study / Project / Article / Code / Other; · fix: Port the kit sheet with description, file upload, server-derived source and 3-way visibility.
- **data** (both) — feature `work-import`: kit: Single empty state: Upload icon, 'Nothing visible here yet' / 'Add a piece or import from GitHub, Behance and more.' · live: Two variants: 'Add one piece you're proud of.' / 'Link a case study, project, article, or code.', and 'Nothing visible here yet' / 'Mark pieces visible on profile to preview them here.' · fix: Use the kit empty state once import exists.
- **ui** (web): kit: Signed-out shell chrome (topbar and sidebar 'Sign in') · live: Signed-in shell · fix: None in this cluster (AppShell).
- preview scaffolding not shipped: 2 item(s)

### `19_plans__default`
- **ui** (both): kit: Credit pill sits under the label (web: pill top ~154px; · live: Pill sits ~21px higher (top ~133px) and the lede wraps one word later · fix: In client/src/components/plans/PlansCredits.tsx CreditCta, reserve the label's block height on .heading-aside (padding-top equal to the preview-label line) so the pill lands at the kit position without showing the label.
- **data** (both) — feature `credit-packs`: kit: Pill reads '3 free credits · ADD CREDITS' and opens the Add credits modal (pack → pay → done) · live: Pill reads '0 credits' (or '3 free credits' when signed out) and links to /premium?role=… · fix: Show the real tool-credit balance: welcome + plan + purchased credits from credit-rollover-ledger.
- **reversal** (both) — feature `kit-pricing`: kit: Three cards: Start $8, Momentum $20 (featured) and Land $100, with kit taglines and feature lists (monetization-data.ts seekerPlans). · live: Free ₹0 / Pro ₹599 / Max ₹1,299 cards from shared/subscriptionPlans.ts. · fix: Render the cards from shared/planCatalog.ts (aligned to PRICING.md) through a new GET /api/plans/catalog.
- **data** (both) — feature `kit-pricing`: kit: Each card has a Monthly/Yearly radiogroup (.plan-billing, selected = blue fill) with a yellow '2 mo free' save-flag. · live: No segment. · fix: Add the shared yearly state and yearly item prices (skipwait_{plan}_yearly-{USD|INR}).
- **data** (both) — feature `kit-pricing`: kit: Land card has a .pro-levels radiogroup ($100 / $200 / $500+) and a .pro-detail line: 'Focus · 120 credits/month · 30 open requests. · live: Absent · fix: Render the Land Focus/Sprint/Concierge levels from the catalog: 120/300/1,000 credits and 30/50/unlimited slots per PRICING.md.
- **data** (both) — feature `kit-pricing`: kit: Crown 'Most chosen' plan-flag on Momentum · live: A Crown 'Your plan' flag shows only on the active paid card · fix: Return catalog.mostChosen, computed from active-subscription counts per tier above an owner-set threshold.
- **ui** (both) — feature `kit-pricing`: kit: Momentum is the featured card (thick ink border, offset shadow, slightly raised) · live: Pro is featured: the selected or active plan · fix: Feature the middle tier, Momentum, per the kit.
- **reversal** (both) — feature `open-ask-slots`: kit: Grid note: 'Every account starts on the free tier — asking for referrals, tracking requests and showing your first three pieces of work cost nothing, ever. · live: '…asking for referrals and tracking every request cost nothing, ever. · fix: Use the kit copy once asks are free with slot caps (open-ask-slots) and Free showcase = 3 (plan-entitlements).
- **ui** (both): kit: No gateway line under the grid · live: Extra line: 'Razorpay (INR) · Secure hosted checkout via Chargebee. · fix: Move the gateway descriptor and the payment-route switch into CheckoutDialog and CreditsDialog so the correction stays reachable.
- **data** (both) — feature `credit-metered-tools`: kit: Credits bar: 'YOUR BALANCE 0 credits' plus a cost strip: 1 cr Ask coach rewrite / 1 cr Profile strength check / 3 cr Company research report · live: Cost strip: 1 cr One private referral request / ₹99 Each extra credit / 3 free Requests every month · fix: Render the first three entries of the credit-action catalog (GET /api/credits/actions).
- **data** (both) — feature `credit-rollover-ledger`: kit: 'New here? Every account gets 3 free credits after completing a profile. · live: 'Every account gets 3 free referral requests every month. · fix: Add the one-time welcome grant of 3 credits on profile completion, then use the kit copy.
- **data** (both) — feature `upgrade-nudges`: kit: Three usage cards, each with a meter: 'Open referral slots used' x of N / 'Credits used' x of y / 'Plan credits expiring' N (empty meter). · live: Monthly requests used (meter) / Credits you bought (no meter) / Next reset date (no meter) · fix: Feed the cards from summary.openSlots, creditsUsedThisCycle/creditsGrantedThisCycle and planCreditsExpiringSoon.
- **data** (both) — feature `upgrade-nudges`: kit: Upgrade moments, 3 cards: 'Your 3 requests are all open' (See Momentum / I'll wait), 'You're out of credits' (Add credits / Compare plans), '4 credits expire in 7 days' (Use credits / Dismiss) · live: 2 cards keyed to the monthly allowance ('Your 3 requests are all in use', 'See Pro'). · fix: Trigger each card on real limits: slot cap, zero credits, plan credits expiring within 7 days.
- **reversal** (both) — feature `open-ask-slots`: kit: Fair band: 'Asking for a referral is free, forever.' / 'Referrers never see who has a paid plan.' · live: '3 referral requests every month are free.' / 'Referrers never pay to review requests.' · fix: Use the kit lines once asks are free.
- **data** (both) — feature `signature-tools`: kit: SIGNATURE TOOLS section 'Things you can hold, send and use': 6 cards (Ask One-Pager 2 / Salary & negotiation coach 5 / Human expert review 25 / Interview dossier 4 / Offer comparison 3 / Thank-you & follow-up pack 1), ea… · live: Section missing · fix: Build the tools and render the section from the tool catalog.
- **reversal** (both) — feature `plan-entitlements`: kit: Compare table: 5 columns (Feature/Free/Start/Momentum/Land) and 12 rows (Open requests at once, Preparation tools, Uploads and memory, Role and company research, Guided workflows, Showcase pieces, Pinned on requests, Cus… · live: 4 columns (Free/Pro/Max) and 8 live-only rows. · fix: Generate the rows from shared/planEntitlements.ts + planCatalog.
- **data** (both) — feature `context-nudges`: kit: HELP, IN CONTEXT section 'Offered at the right moment. · live: Section missing · fix: Add GET /api/nudges/context that computes each card from the user's own data: the company of their last passed ask, their real profile readiness score, and custom-link availability.
- **data** (both) — feature `referrer-tips`: kit: Referrers band: 'Open your door, keep your capacity, earn verified badges and an impact record. · live: 'Open your door, keep your capacity and build a verified impact record. · fix: The tip sentence needs a real tips plus payout feature, which is an owner decision because SCREENS.md /landed says 'no gifts/payments'.
- **reversal** (both) — feature `kit-pricing`: kit: FAQ is kit text: 'How many referral requests can I have open?' (3/8/15/30, 50 Sprint, unlimited Concierge), credits = $1 finished work, carryover 1/3 months or while subscribed, cancel 'in two taps', referrer tips, local… · live: Same 7 questions answered for Free/Pro/Max: 'How many referral requests can I send?', monthly reset · fix: Generate the answers from the catalog so the numbers never drift.
- **ui** (both): kit: Footer link text 'Hiring? See company plans' · live: 'Hiring? See SkipWait for companies' · fix: Use the kit copy, linking to /for-companies.
- **legal** (both): kit: No refund link in the footer note · live: 'Refund & cancellation policy' link in the footer note · fix: Keep the refund link inside CheckoutDialog and CreditsDialog for gateway compliance.
- preview scaffolding not shipped: 3 item(s)

### `19_plans__step1-yearly-2-mo-free`
- **data** (both) — feature `kit-pricing`: kit: Yearly radio selected (blue) with the yellow '2 mo free' flag on every card. · live: No segment. · fix: Add yearly item prices and catalog prices (yearly = 10 × monthly).
- **data** (both) — feature `kit-pricing`: kit: Land level picker shows yearly values ($1,000 / $2,000 / $5,000+) and the Focus detail line · live: Absent · fix: Make the level picker follow the shared yearly state, using the Land level yearly prices from the catalog.
- **ui** (both) — feature `credit-rollover-ledger`: kit: Signed-out credits bar reads 'YOUR BALANCE 0 credits'. · live: Signed-out credits bar reads 'EVERY MONTH 3 free credits'. · fix: When signed out, show the one-time welcome-credit offer (not a monthly allowance) with the kit labels.

### `19_plans__step2-upgrade-to-momentum`
- **data** (both) — feature `kit-pricing`: kit: Title '{Momentum} · yearly — …' carries the chosen tier, Land level and billing period · live: Title 'Pro — secure checkout'. · fix: Build the title from tier, Land level and period, e.g.
- **ui** (both): kit: One short paragraph that mentions local payment methods (UPI, cards, wallets) · live: Longer paragraph: 'Pay with Razorpay (INR). · fix: Shorten to one kit-length truthful sentence about local methods, e.g.
- **legal** (both): kit: No refund link in the dialog · live: 'Refund & cancellation policy' link · fix: Keep the link in the dialog for payment-gateway compliance.
- **data** (both) — feature `subscription-management`: kit: The upgrade dialog works from any state · live: subscription-checkout refuses while a plan is active. · fix: For an active subscriber, route the dialog's Pay to POST /api/chargebee/subscription-change (hosted checkout_existing_for_items).
- preview scaffolding not shipped: 1 item(s)

### `20_billing__cancelling`
- **data** (both) — feature `subscription-management`: kit: Primary 'Keep my plan' button (web: right of the h2 block; · live: Missing. · fix: POST /api/chargebee/subscription-reactivate (Chargebee remove_scheduled_cancellation).
- **data** (both) — feature `kit-pricing`: kit: h2 'Momentum · $20/month' · live: 'Pro · 10 requests/month' · fix: Same summary price fields as default.
- **data** (both) — feature `billing-payment-methods`: kit: Saved-method rows · live: Explanation paragraph · fix: As in default.
- **data** (both) — feature `billing-invoices`: kit: Subscription receipts with download icons · live: Pack-only rows · fix: As in default.
- preview scaffolding not shipped: 1 item(s)

### `20_billing__default`
- **ui** (both): kit: 'Compare plans →' with a small inline Unicode arrow · live: 'Compare plans' + lucide ArrowRight size-4 with a wider gap (noticeably larger on mobile) · fix: Keep lucide, because DESIGN.md bans Unicode glyph icons.
- **data** (both) — feature `kit-pricing`: kit: h2 'Momentum · $20/month' · live: h2 'Pro · 10 requests/month' · fix: Add planLabel, subscriptionAmount, subscriptionCurrency and billingPeriod to /api/credits/summary from the stored subscriptionItemPriceId.
- **data** (both) — feature `open-ask-slots`: kit: 'Renews 6 Nov 2026 · 8 open asks · 30 credits/month' · live: 'Renews 6 Nov 2026 · 7 of 10 requests left this cycle' · fix: Render the slot cap and credits per month from the catalog.
- **data** (both) — feature `subscription-management`: kit: 3-column action grid: outline ArrowUp 'Upgrade to Land', outline ArrowDown 'Switch to Start', ghost 'Cancel plan' · live: Outline 'Compare plans →' + ghost 'Cancel plan' (col 3) · fix: Add the plan-change endpoint.
- **data** (both) — feature `subscription-management`: kit: Cancel flow: 'Why are you leaving?' reasons radio (Got a job, Too expensive, Not using it enough, Missing a feature, Other) → 'Before you go' with 'Pause for 1 month' / 'Cancel anyway', or a 'Congratulations!' path for G… · live: Only 'Before you go' confirm → 'Plan cancelled.' No reasons and no pause. · fix: Persist the reason (cancellation feedback table) and add a Chargebee pause endpoint.
- **data** (both) — feature `billing-payment-methods`: kit: Saved methods: 'Visa •••• 4242 · Default · expires 08/28', 'UPI · asha@okbank · India only · AutoPay mandate [Make default]', 'PayPal · Outside India [Make default]', then outline 'Add payment method' · live: Paragraph saying there are no saved methods to list · fix: Read Chargebee payment_sources for the user's customer id.
- **ui** (both): kit: 'India: cards, UPI, netbanking and wallets. · live: 'Plans are charged in rupees in India and in US dollars elsewhere. · fix: Use the kit wording, with the currency clause made truthful: INR in India, USD elsewhere.
- **data** (both) — feature `billing-invoices`: kit: Receipts: '6 Oct 2026 · Momentum · monthly · $20 ⤓', '6 Sep 2026 · Momentum · monthly · $20 ⤓', '21 Aug 2026 · 25 credits · $22 ⤓' · live: Only credit-pack rows from paymentFulfillments. · fix: Add a billingInvoices ledger fed from webhooks (subscription + pack).
- **ui** (web): kit: Row text is the description only · live: '5 credits · Chargebee · inv_2026_1006' (provider and invoice id on sm+), plus footnote 'Settled payments appear here with provider references.' · fix: Drop the provider and invoice id from the row and remove the footnote.
- preview scaffolding not shipped: 2 item(s)

### `20_billing__free`
- **data** (both) — feature `open-ask-slots`: kit: '3 open asks · buy credits anytime' · live: '3 referral requests a month · buy credits anytime' · fix: Use the Free slot cap from the catalog.
- **data** (both) — feature `billing-payment-methods`: kit: Saved methods list with Make default and Add payment method on a Free account · live: Explanation paragraph · fix: Same payment-methods endpoint.
- **data** (both) — feature `billing-invoices`: kit: Subscription and pack receipts with download icons · live: Pack rows only, provider refs, no download · fix: Same billingInvoices ledger and PDF endpoint.
- preview scaffolding not shipped: 1 item(s)

### `20_billing__payment-issue`
- **data** (both) — feature `billing-dunning`: kit: Panel tone='muted' with border-destructive/40: 'Your last payment failed.' / 'You keep {plan} until {date}. · live: Not rendered. · fix: Record payment_failed and dunning state from webhooks and expose summary.paymentIssue {dueSince, graceEndsAt, invoiceId}.
- **data** (both) — feature `subscription-management`: kit: Current plan panel still shows Upgrade to Land / Switch to Start / Cancel plan · live: Compare plans / Cancel plan · fix: Same plan-change actions as default.
- preview scaffolding not shipped: 1 item(s)

### `21_settings__default`
- **ui** (both) — feature `settings-kit-shell`: kit: Heading (eyebrow ACCOUNT, h1 'Settings.') then grid md:grid-cols-[200px_minmax(0,1fr)] gap-6. · live: No section nav. · fix: Rebuild client/src/pages/Settings.tsx as the kit layout.
- **ui** (both) — feature `settings-kit-shell`: kit: Kit Panel: rounded-3xl border border-border bg-card p-5 sm:p-6, lucide icon size-5 mb-2, h2 text-lg font-semibold. · live: Cards are rounded-2xl p-7 sm:p-9 with font-display text-3xl/2xl tracking-[-.04em] headings. · fix: Use only the kit Panel/field and tokens (border-border, bg-card, text-muted-foreground, text-destructive, primary).
- **reversal** (both) — feature `region-preferences`: kit: Region tab (default): Language & region Panel with Globe2 icon. · live: Region tab does not exist. · fix: Build the Region panel on persisted preferences: accountPreferences table + GET/PUT /api/account/preferences, with a device-local fallback for guests.
- **data** (both) — feature `multi-currency-pricing`: kit: Muted note: 'Momentum shows as ₹1,699/month. · live: Missing. · fix: Take the Momentum monthly price for the selected currency from a server price catalog backed by Chargebee item prices (GET /api/pricing/catalog?currency=).
- **data** (both) — feature `region-preferences`: kit: Footnote: 'Ask expiry and message times always show in your time zone. · live: Missing. · fix: Render this text only once times app-wide go through the shared formatter that uses accountPreferences.timeZone/dateFormat, and once dir=rtl is applied for Arabic.
- **ui** (both) — feature `settings-kit-shell`: kit: The reference is captured signed out and still shows the full kit Settings page inside the shell, with the Region tab usable. · live: Signed out renders data-skipwait-screen='settings-sign-in': the legacy Brand 'SKIPWAIT.ME' mark, a rounded-2xl card 'Sign in to manage your work-email access and privacy controls.' with a 'Secure sign… · fix: Signed out, render the kit page.
- **data** (both) — feature `notification-preferences`: kit: Notifications tab. · live: Tab does not exist. · fix: Add a notificationPreferences table, GET/PUT /api/notification-preferences, a central dispatcher that gates every existing email/in-app send, the ask-expiring, weekly-summary and credits-expiring jobs, and web-push for the Push channel.
- **data** (both) — feature `app-display-preferences`: kit: App tab. · live: Tab does not exist. · fix: Install action: pwa-install.
- **data** (both) — feature `blocking`: kit: Privacy tab. · live: Tab does not exist. · fix: Add a userBlocks table, GET/POST/DELETE /api/blocks, and two-way enforcement.
- **data** (both) — feature `privacy-consent-controls`: kit: Privacy tab. · live: Missing. · fix: Store the two consent categories (analytics, errors) on the device and drive the toggles from that stored value.
- **ui** (both) — feature `settings-kit-shell`: kit: Privacy tab. · live: Missing from Settings. · fix: Add the Panel and link.
- **data** (both) — feature `data-export-async`: kit: Privacy tab. · live: 'Download my data' downloads JSON synchronously from GET /api/privacy/export. · fix: Make export an asynchronous privacyRequests kind 'export'.
- **data** (both) — feature `session-management`: kit: Account tab. · live: Missing. · fix: Add an accountSessions registry keyed by a sid claim or WorkOS sid, with GET /api/account/sessions, DELETE /api/account/sessions/:id and POST /api/account/sessions/revoke-others (WorkOS session revoke for the WorkOS provider).
- **data** (both) — feature `account-deletion-grace`: kit: Account tab. · live: A 'Request account deletion' AlertDialog creates an admin-reviewed privacyRequests erasure ('Request account deletion review?'). · fix: Implement self-serve scheduled deletion with a 14-day grace period: GET /api/account/deletion-preview for the real counts, POST /api/account/deletion {confirm:'DELETE'}, POST /api/account/deletion/cancel, and an executor job.
- **ui** (both) — feature `settings-kit-shell`: kit: The kit has no Work email, Profile & visibility, Talent discovery consent, Slack review alerts or legal-link row in Settings. · live: Live-only cards: Work email (verify CTA / 'Switch to Job Referrer mode'), Profile & visibility (Edit profile / Manage work), Talent discovery consent (binding opt-in/opt-out with field checkboxes; · fix: Talent discovery consent must stay reachable because it is the binding opt-out.
- preview scaffolding not shipped: 2 item(s)

### `22_assistants__activity`
- **data** (both) — feature `assistant-approvals-v2`: kit: 'Drafted an ask to Wipro' + note 'Waiting for your approval' · live: 'Drafted an ask' with no note (metadata has no company, and the approval's current status is not joined) · fix: Log companyName/approvalId in the activity metadata.
- **data** (both) — feature `mcp-kit-tools`: kit: 'Searched companies: “product design, Bengaluru”' · live: 'Searched roles' (tool search_jobs; · fix: search_companies tool.
- **data** (both) — feature `paid-tools`: kit: 'Ran Ask One-Pager · 3 credits' / 'Approved by you' · live: 'Asked to use credits' / 'Approved by you' (no toolKey, nothing runs) · fix: credit_spend approvals carry toolKey + cost and run the tool on approve.
- **data** (both) — feature `ask-send-limits`: kit: 'Tried to send a 9th ask' / 'Blocked: open-request limit' (destructive) · live: Only blocked case is 'Tried to use SkipWait / Blocked: your plan does not include assistants' · fix: send_ask/draft_ask log a denied event with reason open_request_limit|daily_limit|duplicate|scope and the attempted ordinal
- **data** (both) — feature `assistant-connection-grants`: kit: who = 'ChatGPT' / 'Claude' on every row · live: MCP events log only tokenId → 'API token'. · fix: verifyBearer returns connection + clientName.
- preview scaffolding not shipped: 1 item(s)

### `22_assistants__api-tokens`
- **ui** (both): kit: 'Job-tracker script · created 1 Oct' · live: 'Job-tracker script · created 1 Oct · sw_7QkA2bLm…' (+ ' · used 2 hours ago' when used) · fix: Render exactly '{name} · created {date}'.
- **data** (both) — feature `assistant-connection-grants`: kit: Only personal tokens the member created · live: OAuth-minted bearers also appear here as '<ClientName> (OAuth abc123)' · fix: Add assistantTokens.kind ('personal'|'oauth').
- **data** (both) — feature `public-rest-api-v1`: kit: New-token panel shows 'sw_live_••••…7Qk2' · live: tokens are 'sw_' + 32 chars · fix: Mint new personal tokens as 'sw_live_' + 32 base64url.
- **data** (both) — feature `mcp-kit-tools`: kit: 'Tokens can read, draft and send with approval. · live: Same copy, but no tool sends and no tool runs a paid tool · fix: Ship send_ask/run_tool (approval-gated) so the footnote is true
- preview scaffolding not shipped: 1 item(s)

### `22_assistants__default`
- **data** (both) — feature `mcp-public-endpoint`: kit: How to connect step 1: add `skipwait.me/mcp` · live: `skipwait.me/api/mcp` · fix: Serve MCP at skipwait.me/mcp (Worker route + alias), then render kit text verbatim
- **data** (both) — feature `assistant-connection-grants`: kit: Rows 'ChatGPT / Read · Draft · Send with approval · Credits with approval / Used 2 hours ago' are the assistants that really hold access · live: Rows come only from POST /api/assistants/connections, the in-app consent with no credential. · fix: Create the connection at OAuth token exchange and link its tokens.
- **data** (both) — feature `ask-send-limits`: kit: 'Assistants follow the same limits as you: open-request slots, daily asks, quality checks.' · live: Same copy, but no daily ask limit and no server-side quality check exist, and no plan slot caps are enforced (kit-pricing) · fix: Enforce per-plan slot caps, a daily send cap and quality checks on every ask path so the copy is true
- **data** (both) — feature `assistant-connection-grants`: kit: 'Preview the approval screen' links to /connect-assistant · live: Links to /connect-assistant in in-app mode. · fix: Keep the link.
- **ui** (mobile): kit: Safety hint wraps 'Always on. · live: AlwaysOnRow <div> keeps the hint on one line · fix: Render the kit Toggle markup (button role=switch aria-checked=true aria-disabled, no-op onChange) in @client/src/components/assistants/AssistantPanels.tsx
- preview scaffolding not shipped: 1 item(s)

### `22_assistants__momentum-or-start`
- **reversal** (both) — feature `assistant-land-entitlement`: kit: 'Assistants and API tokens come with Land' / 'Land and Concierge members can sign in, connect and apply from ChatGPT, Claude, bots and their own tools.' / 'Upgrade to Land' · live: '…come with Max' / 'Max members can…' / 'Upgrade to Max' · fix: Kit copy verbatim in PlanGate.
- preview scaffolding not shipped: 1 item(s)

### `23_approve__declined`
- **data** (both) — feature `approval-notifications`: kit: 'Shown as a push notification and in Alerts. · live: 'Unanswered approvals expire after 24 hours.' · fix: As in default
- preview scaffolding not shipped: 1 item(s)

### `23_approve__default`
- **ui** (both): kit: 'ChatGPT · just now' · live: 'ChatGPT · just now · 23 h left' · fix: Drop timeLeft from SourceLine (the 24h rule stays in the footnote)
- **data** (both) — feature `assistant-approvals-v2`: kit: 'Send this ask to Wipro?' · live: 'Send this ask to wipro.com?' (approvals store companyDomain only) · fix: Store companyName, resolved at draft time from the job-link preview and company directory.
- **data** (both) — feature `assistant-approvals-v2`: kit: 'Senior Product Designer · Bengaluru · uses 1 of your 30 open slots' · live: '{role} · uses 1 of your {slotCount} open slots[ · 1 credit]'. · fix: Fill role + location from jobLinkPreview at proposal time.
- **data** (both) — feature `ask-quality-checks`: kit: ✓ 'Quality check passed' ✓ 'Location fits the role' · live: ✓ 'Assistants draft, you send' ✓ 'Same open-request limits as you' · fix: Run the shared askChecks + location-fit on the payload server-side.
- **data** (both) — feature `ask-provenance`: kit: ✓ 'Referrer sees “Sent with ChatGPT”' · live: ✓ 'Routed like every ask you send' (no provenance stored or shown to referrers) · fix: Store sentVia on the referral request.
- **data** (both) — feature `approval-notifications`: kit: Footnote 'Shown as a push notification and in Alerts. · live: 'Unanswered approvals expire after 24 hours.' · fix: Create a notification + web push when an approval is created.
- **data** (both) — feature `assistant-connection-grants`: kit: Source 'ChatGPT' · live: Real proposals show 'Your assistant' (provider never passed from MCP) · fix: Approval provider = connection clientName, with connectionId set
- preview scaffolding not shipped: 1 item(s)

### `23_approve__editing`
- **ui** (both): kit: 'ChatGPT · just now' · live: '… · 23 h left' · fix: Drop timeLeft
- **data** (both) — feature `assistant-approvals-v2`: kit: 'Send this ask to Wipro?' / '… · Bengaluru · uses 1 of your 30 open slots' · live: domain title, no location · fix: As in 23_approve__default
- **data** (both) — feature `ask-quality-checks`: kit: kit three checks · live: generic three lines · fix: As in default.
- **data** (both) — feature `approval-notifications`: kit: push/Alerts footnote · live: 24h sentence only · fix: As in default
- preview scaffolding not shipped: 1 item(s)

### `23_approve__sent`
- **data** (both) — feature `assistant-approvals-v2`: kit: 'ChatGPT has been told. · live: 'Approved. · fix: On decision, enqueue an approval.decided event: MCP get_approval/list results expose it, and registered apps get the webhook.
- **data** (both) — feature `approval-notifications`: kit: push/Alerts footnote · live: 24h sentence only · fix: As in default
- preview scaffolding not shipped: 1 item(s)

### `23_approve__slots-full`
- **data** (both) — feature `assistant-approvals-v2`: kit: 'All 30 slots are in use' · live: 'All your slots are in use'. · fix: At read time, compute the open pending requests and the plan cap (kit-pricing openRequests).
- **ui** (both): kit: 'ChatGPT saved this ask as a draft. · live: '… saved this ask as a draft for wipro.com. · fix: Kit copy verbatim (drop 'for {company}')
- **data** (both) — feature `assistant-approvals-v2`: kit: 'Keep as draft' keeps the ask · live: onDecide('declined'): the approval is declined and lost · fix: Add status 'draft' (no expiry).
- **ui** (both): kit: 'ChatGPT · just now' · live: '… · 23 h left' · fix: Drop timeLeft
- **data** (both) — feature `approval-notifications`: kit: push/Alerts footnote · live: 24h only · fix: As in default
- preview scaffolding not shipped: 1 item(s)

### `23_approve__spend-credits`
- **data** (both) — feature `paid-tools`: kit: 'Make an Ask One-Pager?' / 'Use 3 credits' · live: 'Run this paid tool?'. · fix: Add a toolKey column + the paid-tools catalog (name, cost).
- **data** (both) — feature `assistant-approvals-v2`: kit: 'For Senior Product Designer at Wipro' · live: 'For Senior Product Designer at wipro.com' · fix: Use companyName
- **ui** (both): kit: 'ChatGPT · just now' + kit lucide Coins · live: '… · 23 h left' + newer Coins glyph · fix: Drop timeLeft.
- **data** (both) — feature `approval-notifications`: kit: push/Alerts footnote · live: 24h only · fix: As in default
- preview scaffolding not shipped: 1 item(s)

### `24_connect-assistant__approved`
- **data** (both) — feature `assistant-connection-grants`: kit: 'Manage assistants' leads to a list that includes the newly connected ChatGPT · live: OAuth approval creates no assistantConnections row, so /assistants does not list it · fix: Upsert the connection at token exchange (status connected, granted scopes, oauthClientId)
- preview scaffolding not shipped: 1 item(s)

### `24_connect-assistant__declined`
- preview scaffolding not shipped: 1 item(s)

### `24_connect-assistant__default`
- **ui** (both): kit: '→' text-2xl muted between the two tiles · live: lucide ArrowRight size-5 · fix: Keep the lucide icon (DESIGN.md bans glyph icons).
- **reversal** (both) — feature `assistant-connection-grants`: kit: All five 'It can' boxes ticked by default (kit useState(can.map…)) · live: Only read + draft ticked (least-privilege default) · fix: Default all five checked for verified apps.
- **data** (both) — feature `ask-provenance`: kit: 'Asks it sends show “Sent with ChatGPT” to the referrer. · live: 'Nothing it drafts is sent until you approve it in SkipWait. · fix: Kit copy once provenance ships.
- **data** (both) — feature `developer-app-oauth`: kit: Trusted consent 'Connect ChatGPT to SkipWait' for a real OAuth request · live: Every OAuth client goes straight to the unverified screen, so this consent renders only in in-app mode, where Approve writes a credential-less connection. · fix: Verified clients (live developer apps, or dynamic clients whose redirect hosts are all in an admin-approved verifiedOAuthHosts table) get this consent with their canonical name/logo.
- **ui** (both): kit: 'as asha@gmail.com' (sample) · live: signed-in email · fix: none (real data)
- preview scaffolding not shipped: 1 item(s)

### `24_connect-assistant__expired`
- **data** (both) — feature `assistant-connection-grants`: kit: 'This link has expired / Go back to ChatGPT and start the connection again.' for a stale connection link · live: Shown for any unknown client or redirect mismatch. · fix: Persist an oauthAuthorizationRequests row (10-min TTL) when the consent loads.
- preview scaffolding not shipped: 1 item(s)

### `24_connect-assistant__not-on-land`
- **reversal** (both) — feature `assistant-land-entitlement`: kit: 'Assistants need Land' / '…is part of Land and Concierge.' / 'Upgrade to Land' · live: 'Assistants need Max' / '…is part of Max.' / 'Upgrade to Max' · fix: Kit copy verbatim.
- **data** (both) — feature `assistant-land-entitlement`: kit: A non-Land member arriving from ChatGPT sees this screen · live: In OAuth mode the unverified stage wins the race (the plan check only replaces 'consent'). · fix: Resolve access before choosing the stage (the plan gate takes precedence).
- preview scaffolding not shipped: 1 item(s)

### `24_connect-assistant__signed-out`
- **ui** (both) — feature `password-auth`: kit: Button links to /sign-in and returns here · live: SignInButton (WorkOS) with return · fix: When password-auth ships, point to /sign-in?returnTo=<current URL incl.
- preview scaffolding not shipped: 1 item(s)

### `24_connect-assistant__unverified-app`
- **ui** (both): kit: 'It connected through the open MCP link. · live: 'It named itself “JobBot” and will send you back to chatgpt.com. · fix: Kit copy verbatim (the callback host stays visible in the consent footnote)
- **data** (both) — feature `developer-app-oauth`: kit: '…until it's verified' implies a verification path · live: No way for an OAuth client to become verified · fix: Verified = a live developer app or an allowlisted redirect host
- preview scaffolding not shipped: 1 item(s)

### `25_developers__default`
- **reversal** (both) — feature `assistant-land-entitlement`: kit: '…You approve every send. · live: 'For Max members.' / 'Members on Max can connect apps and approve the asks they propose.' · fix: Kit copy verbatim
- **data** (both) — feature `mcp-public-endpoint`: kit: MCP connector card: 'Add https://skipwait.me/mcp in ChatGPT, Claude, Cursor…' · live: https://skipwait.me/api/mcp · fix: Serve /mcp, update MCP_ENDPOINT
- **data** (both) — feature `public-rest-api-v1`: kit: Card 2 (KeyRound) 'REST API — Personal tokens for scripts, trackers and spreadsheets. · live: Card 'Personal tokens — Create one in Connected assistants…' and a JSON-RPC curl to /api/mcp · fix: Ship /api/v1 + sw_live_ tokens, then kit copy and curl verbatim
- **data** (both) — feature `developer-webhooks`: kit: Card 3 (Webhook icon) 'Webhooks — Signed events when an ask is accepted, passed or gets a message.' · live: Card 'Your approval' (CircleCheck) · fix: Ship signed webhook delivery, then the kit card
- **data** (both) — feature `mcp-kit-tools`: kit: 10 rows: search_companies, get_company, list_my_requests, get_request_thread, draft_ask, send_ask, withdraw_ask, run_tool, list_alerts / save_alert, add_work_item · live: 5 rows: search_jobs, list_my_requests, list_my_alerts, list_my_resumes, propose_ask · fix: Implement the kit tools.
- **data** (both) — feature `ask-send-limits`: kit: Same rules: 'Same open-request slots and daily ask limit' / 'Quality checks on every ask' / 'Referrer sees which assistant helped' / 'Every call logged in your Activity' · live: 'Same open-request slots and credit costs' / 'Quality checks on every ask' / 'You approve every ask before it is sent' / 'Every call logged…' · fix: Daily limit + provenance (ask-provenance) make the kit list true.
- preview scaffolding not shipped: 2 item(s)

### `26_developer-console__app-details`
- **ui** (both): kit: No back link above the title · live: '← Your apps' text button · fix: Remove it.
- **data** (both) — feature `developer-app-oauth`: kit: Client secret '••••••••••••' + 'Rotate' outline button · live: 'Not issued yet', no button (no secret exists) · fix: clientSecretHash + POST …/secret/rotate (shown once).
- **data** (both) — feature `developer-app-usage-stats`: kit: Connected users / Asks sent via app / Approval rate tiles · live: Hard-coded '—' / 'Shown once live' for every status · fix: GET …/stats.
- **data** (both) — feature `developer-webhooks`: kit: Webhook input only + 'Events are signed. · live: Input + 'Events are not sent yet. · fix: Ship signed delivery.
- **data** (both) — feature `developer-app-oauth`: kit: 'Limits: per user, the same open-request and daily-ask limits as the SkipWait app. · live: '…open-request limits…, and 120 requests/min per token. · fix: Durable per-app 600/min window + daily ask limit, then kit copy.
- **data** (both) — feature `developer-app-review-admin`: kit: No submit panel (Create app goes straight to In review) · live: Test/rejected apps show 'Your app is in test mode… Submit for review' Panel · fix: Create sets in_review (kit flow).
- preview scaffolding not shipped: 1 item(s)

### `26_developer-console__default`
- **ui** (web): kit: '+ New app' wraps onto its own row below the subtitle at 1280 · live: Button beside the subtitle (flex-wrap tips the other way on sub-pixel width) · fix: Force the kit wrap deterministically in @client/src/pages/DeveloperConsole.tsx (put the button on its own row, e.g.
- **data** (both) — feature `developer-app-oauth`: kit: 'Instinct (staging) · Test mode · 3 test users' · live: 'AI agent · Test mode' (no test users exist) · fix: Add developerAppTestUsers.
- preview scaffolding not shipped: 1 item(s)

### `26_developer-console__in-review`
- **ui** (both): kit: No back link · live: '← Your apps' · fix: Remove (URL routing)
- **data** (both) — feature `developer-app-oauth`: kit: 'Test mode works now for up to 10 test users. · live: 'Review for send and profile permissions usually takes 2–5 business days.' (registered sw_app_ clients cannot authenticate at all) · fix: Test mode for app owner + ≤10 test users via OAuth.
- preview scaffolding not shipped: 1 item(s)

### `26_developer-console__new-app`
- **ui** (both): kit: Textarea placeholder 'Shown to users on the approval screen' in light muted grey · live: Darker #505050 from the global ::placeholder rule · fix: Use placeholder:text-muted-foreground on this textarea (RegisterAppForm) or correct the global token in index.css after an audit
- **data** (both) — feature `developer-app-oauth`: kit: AI-agent Panel: 'MCP clients can also connect with no registration through skipwait.me/mcp (dynamic registration). · live: '…through skipwait.me/api/mcp… Registering gets you a verified badge once your app passes review.' · fix: Logo upload + logo/description on the verified consent + higher verified limits + /mcp.
- **data** (both) — feature `developer-app-review-admin`: kit: Terms checkbox (developer terms) · live: Checkbox is validated but acceptance is not stored, and no developer-terms text exists · fix: Store termsAcceptedAt/termsVersion on the app.
- preview scaffolding not shipped: 1 item(s)

### `26_developer-console__rejected`
- **ui** (both): kit: Only 'Edit and resubmit'; · live: Adds '← Your apps' and ghost 'Open app details' · fix: Remove both (details reachable by URL)
- **data** (both) — feature `developer-app-review-admin`: kit: Edit and resubmit updates this registration · live: The form posts POST /api/developer-apps: a NEW app with a new client id. · fix: PATCH /api/developer-apps/:id {…, resubmit:true} → in_review, clears rejectReasons.
- preview scaffolding not shipped: 1 item(s)

### `26_developer-console__suspended`
- **ui** (both): kit: Only 'Contact safety team'; · live: Adds '← Your apps' and ghost 'Open app details' · fix: Remove both
- **data** (both) — feature `developer-app-review-admin`: kit: 'Many referrers reported repeated asks sent through your app. · live: 'Our safety team suspended this app. · fix: Admin suspend stores suspensionReason, revokes the app's tokens and notifies connected users.
- preview scaffolding not shipped: 1 item(s)

### `27_safety__default`
- **reversal** (both): kit: Answer 4: 'It confirms ownership of an email address on an approved company domain. · live: 'It confirms a one-time code reached an inbox on that company domain. · fix: In client/src/pages/Safety.tsx, use the kit sentence verbatim.
- **reversal** (both): kit: Answer 5: 'The proposed experience keeps resumes private until a referrer accepts a request. · live: 'Only with a referrer who accepted your request — never before, never publicly.' · fix: Use the kit's first sentence without the preview wording: 'Resumes stay private until a referrer accepts a request.' Drop the preview sentence.
- **ui** (both) — feature `safety-report-review`: kit: Answer 6: 'Do not pay for a referral or share sensitive financial information. · live: '…Contact support and we will review it.' · fix: Keep the kit's first sentence verbatim, then point to the real channel: 'Use Report on the conversation — it's confidential.' Link it to /report.
- preview scaffolding not shipped: 1 item(s)

### `28_help__default`
- **reversal** (both): kit: Category pills min-h-10 (40px) · live: min-h-11 (44px), from founder a11y commit c9a8e65 · fix: In the Help.tsx pill() helper, use min-h-10 so the list moves back up 4px on web and about 24px on mobile.
- **reversal** (both): kit: Search placeholder in muted foreground (about 50% ink) · live: #505050 from the global '::placeholder' rule at client/src/index.css:180 · fix: Global rule.
- **ui** (both): kit: Rules & policies: 'Privacy policy' · live: 'Privacy & trust' · fix: Change the Help.tsx link label to 'Privacy policy'.
- **data** (both) — feature `kit-pricing`: kit: Q1 open answer: '…Paid plans only add preparation tools and more open asks at once.' · live: '…Paid plans only add monthly credits on top of the free allowance.' · fix: Use the kit text once kit-pricing ships per-plan open-ask caps and preparation tools.
- **data** (both) — feature `kit-pricing`: kit: Q2: 'Free: 3 at a time. · live: Credit-based answer ('free referral credits each month plus packs… answered, passed, or withdrawn frees its slot') · fix: Use the kit text when the server enforces open-ask caps (Free 3, Start 8, Momentum 15, Land 30/50/unlimited).
- **reversal** (both): kit: Q3: 'If no referrer accepts within 7 days it closes automatically and your slot returns. · live: Longer answer about the reserved credit returning · fix: Use the kit text verbatim.
- **data** (both) — feature `function-taxonomy`: kit: Q5: '…then choose your job areas and monthly capacity.' · live: '…then review private requests for your company.' · fix: Use the kit text once referrer setup stores job areas (function taxonomy) and monthly capacity.
- **data** (both) — feature `company-suggestion-review`: kit: Q6: '…unlisted domains go to a person for review, usually within 2 days.' · live: '…go to a person for manual review.' · fix: Use the kit text once the review queue tracks dueAt (2 days) and sends overdue alerts.
- **data** (both) — feature `kit-pricing`: kit: Q8: 'Purchased credits never expire. · live: '…Monthly plan allowances refresh each billing cycle.' · fix: Use the kit text once plan-credit rollover (1 month, 3 months, or while subscribed) is real.
- **data** (both) — feature `kit-pricing`: kit: Q10: 'Plans & credits → Manage plan → Cancel. · live: 'Open Plans and manage your subscription there…' · fix: Use the kit text once /plans has Manage plan and Cancel (cancel at period end through Chargebee).
- **data** (both) — feature `account-deletion`: kit: Q12: 'Settings → Account → Delete account. · live: Deletion review request (privacyRequests) · fix: Use the kit text once self-serve deletion has a 14-day grace period and undo.
- **data** (both) — feature `safety-report-review`: kit: Q13: 'Don't pay. · live: 'Don't pay. · fix: Use the kit text once the conversation links /report?request=<id> and reports carry a tracked SLA.
- **data** (both) — feature `blocking`: kit: Q14: 'Open the conversation → Report or block. · live: 'Contact support from any conversation and we will step in…' · fix: Use the kit text once self-serve blocking exists.

### `29_report__default`
- **data** (both) — feature `safety-report-review`: kit: 'Back to conversation'. · live: 'Back to requests'. · fix: Link to `/report?request=${requestId}` from ReferralConversation.
- **ui** (both): kit: Kit Button default (h-10, text-sm) for Continue · live: Custom .brand-button with larger type and padding · fix: In Report.tsx, use Button from components/kit/button for Continue, Back, Submit and the step-3 actions.
- preview scaffolding not shipped: 1 item(s)

### `29_report__step1-continue`
- **data** (both) — feature `safety-report-review`: kit: Subtitle 'Optional. · live: 'Optional. · fix: Snapshot the conversation messages into report evidence at filing time.
- **data** (both) — feature `blocking`: kit: Toggle card 'Also block this person / They can't message or send you asks. · live: Muted note: 'To block someone immediately, contact support from this page after filing — blocking both directions is handled by our team for now.' · fix: Build self-serve two-way blocking.
- **ui** (both): kit: Textarea min-h-32 (128px), no rows attribute · live: rows={5} makes it taller; · fix: Drop rows={5} and keep min-h-32.
- **ui** (both): kit: Back is a kit Button variant=ghost (no border, arrow + text); · live: Back is an outlined brand-button with a shadow; · fix: Use the kit Button variants: ghost for Back, default for Submit.
- preview scaffolding not shipped: 1 item(s)

### `29_report__step2-submit-report`
- **data** (both) — feature `blocking`: kit: 'This person is blocked. · live: 'Here's what happens next:' · fix: Prefix the line when the POST response says blocked:true.
- **ui** (both): kit: 'Report received · reference #R-2048' · live: 'Report received · reference R-2048' · fix: Render `#${reference}` (the server reference stays R-(1000+id)).
- **data** (both) — feature `blocking`: kit: Outline 'Manage blocked people' (to /settings blocked list) plus primary 'Back to requests' · live: Outline 'Contact support' plus primary 'Back to requests' · fix: Link to /settings (Privacy section, Blocked people list fed by GET /api/blocks).
- **data** (both) — feature `safety-report-review`: kit: Timeline promises 'Within 48 hours' (or 'Within 4 hours' if urgent) and 'You get a notification with the outcome' · live: Same copy, but the server stores no due time, sends no overdue alert, discards the reviewer note, and sends the outcome only in-app · fix: Persist dueAt, alert the admin on urgent reports and on overdue reports, store the reviewer note, and send the outcome by email and in-app.
- preview scaffolding not shipped: 1 item(s)

### `30_suggest-company__default`
- **ui** (both): kit: Disabled Submit is faded primary (opacity-50) with a grey offset shadow · live: Global rule `button:disabled {background:#e0e0e0; · fix: Conflicts with DESIGN.md:46 ('no opacity-faded disabled states').
- **reversal** (both): kit: Placeholders in muted foreground ('e.g. · live: #505050 (global ::placeholder) · fix: Same global placeholder fix as /help.
- **ui** (both) — feature `company-suggestion-review`: kit: Duplicate hint appears on a prefix match (name length >1, startsWith); · live: Exact-name match against the static LAUNCH_COMPANIES; · fix: Use kit prefix matching against the real company directory (not the static list).
- **data** (both) — feature `company-suggestion-review`: kit: Done state: 'We check the domain and careers page, usually within 2 days. · live: '…We'll notify you when it's reviewed.' / '…unlisted domains go to a person for review.' · fix: Add a 2-day review dueAt with an overdue sweep, auto-list the company when a verified referrer enrolls on the suggested domain, and send a 'now live' notification and email.
- preview scaffolding not shipped: 1 item(s)

### `31_forgot-password__default`
- **data** (both) — feature `password-auth`: kit: Standalone /forgot-password page (kit app/src/routes/forgot-password.tsx): wordmark → mt-10 h1 'Forgot your password?', p 'Enter your account email. · live: No route. · fix: Add client/src/pages/ForgotPassword.tsx, ported verbatim from the kit, registered in App.tsx as a standalone route (no AppShell).
- **ui** (both) — feature `password-auth`: kit: Disabled primary: solid #7e7fff fill (blue at 50%), white label, #888888 offset shadow. · live: Global 'button:disabled{background:#e0e0e0;color:#505050}' and '.brand-button:disabled{box-shadow:none}' (client/src/index.css:177,206) would render it solid grey with no shadow. · fix: Add a kit disabled token for .brand-button:disabled as solid colours that equal the PNG pixels (fill #7e7fff, shadow #888888, white text), not opacity.
- preview scaffolding not shipped: 1 item(s)

### `31_forgot-password__step1-send-reset-link`
- **data** (both) — feature `password-auth`: kit: After 'Send reset link', a neutral 'Check your email.' state that never reveals whether the account exists. · live: No forgot-password backend on main. · fix: POST /api/auth/password/forgot always returns 202 {ok:true} for a valid email, whether or not an account exists.
- **ui** (both) — feature `password-auth`: kit: 'Use a different email' is an outline brand-button with offset shadow that returns to the form, keeping the typed email. · live: n/a · fix: Port verbatim (Button variant=outline mt-6, onClick returns to the form).
- preview scaffolding not shipped: 1 item(s)

### `32_reset-password__default`
- **data** (both) — feature `password-auth`: kit: Reset form shown for a valid link: two password fields with one shared show/hide toggle, the live rule checklist, and 'Update password' enabled only when all rules pass. · live: No route and no reset backend. · fix: Add client/src/pages/ResetPassword.tsx, ported verbatim and standalone.
- **data** (both) — feature `password-auth`: kit: Success state (kit source): Check icon, 'Password updated.', 'You're signed in. · live: n/a · fix: Make the copy true on the server: after WorkOS resetPassword succeeds, run db.revokeUserSessions(openId) (covers the canonical person and every alias) and revoke WorkOS sessions (userManagement.listSessions/revokeSession).
- **ui** (both) — feature `password-auth`: kit: Disabled 'Update password': #7e7fff fill, #888888 offset shadow. · live: The global disabled rule would render solid #e0e0e0 with no shadow. · fix: Same solid-colour kit disabled token as 31 (needs owner sign-off against DESIGN.md:46).
- preview scaffolding not shipped: 1 item(s)

### `32_reset-password__expired-link`
- **data** (both) — feature `password-auth`: kit: Expired-link state for a link that is older than 1 hour or already used. · live: No route and no token store. · fix: POST /api/auth/password/reset/check returns {status:'expired'} for unknown, forged, expired, consumed or superseded tokens, and for a missing token.
- **ui** (both) — feature `password-auth`: kit: 'Send a new link' (Button asChild, w-full, mt-6) → /forgot-password. · live: n/a · fix: Port verbatim.
- preview scaffolding not shipped: 1 item(s)

### `33_app-states__default`
- **data** (both) — feature `web-push`: kit: Install sheet subtitle: 'Know the moment a referrer replies'. · live: 'One tap from your home screen' (client/src/components/app-states/DeviceStates.tsx InstallAndroidSheet). · fix: Restore the kit copy verbatim once web-push ships, since installing plus permission then delivers reply pushes.
- **data** (both) — feature `pwa-install`: kit: The install sheet is a real product moment. · live: beforeinstallprompt is captured only while /app-states is open. · fix: Client-only feature: capture beforeinstallprompt globally at App level, offer the Android sheet / iPhone sheet from Settings → App and once after the first ask is sent, and remember dismissal on the device.
- preview scaffolding not shipped: 1 item(s)

### `33_app-states__install-iphone`
- **data** (mobile) — feature `pwa-install`: kit: iPhone 'Add SkipWait to your Home Screen' guidance is a real flow. · live: Shown only in the gallery. · fix: pwa-install: detect iOS Safari when not standalone and show this sheet from Settings → App and at the post-first-ask moment.
- preview scaffolding not shipped: 1 item(s)

### `33_app-states__loading`
- **ui** (both): kit: Kit Loading state: title bar h-8 w-40, line h-4 w-56, four h-20 rounded-2xl bg-muted animate-pulse blocks, space-y-4. · live: The real route Suspense fallback RouteLoading in client/src/App.tsx is an h-dvh centred bordered card skeleton with hardcoded #e5e5e5/#f0f0f0 and a shadow, unlike the kit loading design. · fix: Replace RouteLoading with the kit Loading skeleton (tokens bg-muted, role=status aria-label='Loading') inside the page-content area.
- preview scaffolding not shipped: 1 item(s)

### `33_app-states__not-found`
- **reversal** (both): kit: The kit real 404 (app/src/routes/__root.tsx NotFoundComponent) has the wordmark, h1 text-4xl, body, and two rounded-full actions (Explore companies / Go home), and nothing else. · live: client/src/pages/NotFound.tsx adds 'Looking for something specific? Contact support' below the actions. · fix: Remove the support line so the kit wins.
- preview scaffolding not shipped: 1 item(s)

### `33_app-states__offline`
- **data** (both) — feature `offline-draft-sync`: kit: 'Your drafts are saved on this device and will send when you're back online.' · live: 'Your drafts are saved on this device. · fix: Build an offline send queue: an IndexedDB outbox of user-confirmed sends, flushed on reconnect with idempotency keys.
- **ui** (both): kit: Offline banner: bg-muted, px-6 py-2, text-sm, WifiOff size-4 icon left, 'You're offline. · live: The global OfflineNotice in client/src/App.tsx is a fixed top bar, bg-[#141414] with white centred text-xs, no icon, reading 'You're offline. · fix: Restyle OfflineNotice to the kit banner using tokens and the icon, with the kit copy.
- preview scaffolding not shipped: 1 item(s)

### `33_app-states__payment-failed`
- **data** (both) — feature `upi-checkout`: kit: Ghost button 'Pay with UPI'. · live: Ghost link 'Contact support' to /support, because UPI checkout was treated as nonexistent. · fix: Add a UPI path for the INR route through the Razorpay gateway (Chargebee hosted checkout limited to UPI, or a direct Razorpay order with method=upi for packs).
- **data** (both) — feature `payment-failure-recovery`: kit: Real failure screen: 'Payment didn't go through.' / 'Your card was declined by your bank. · live: The screen exists only in the gallery. · fix: Record the provider failure code on subscriptionCheckoutIntents, expose GET /api/billing/checkout-intents/:id, and render this kit Center after a failed checkout.
- preview scaffolding not shipped: 1 item(s)

### `33_app-states__push-permission`
- **data** (both) — feature `web-push`: kit: Body: 'We'll only notify you when a referrer accepts, replies, or an ask is about to expire. · live: Body: 'This only sets your browser's permission. · fix: web-push: requestPermission → pushManager.subscribe with the VAPID key → POST /api/push/subscriptions.
- **ui** (mobile): kit: Title wraps 'Know the moment a / door opens.' · live: Wraps 'Know the moment a door / opens.' · fix: Low priority.
- preview scaffolding not shipped: 1 item(s)

### `33_app-states__slow-connection`
- **data** (both) — feature `lite-mode`: kit: 'Slow connection — loading a lighter version.' · live: 'Slow connection — pages may take a moment.' There is no lighter version of the app. · fix: lite-mode: on a 2G-class link or saveData, serve a lighter app (no images/avatars/thumbnails, Clarity and prefetch off, smaller list pages).
- **ui** (both): kit: Banner: bg-muted, px-6 py-2, text-sm, left-aligned, Signal size-4 icon. · live: The real SlowConnectionNotice (client/src/components/PwaStatus.tsx) is a fixed full-width top bar, text-xs, centred, reading 'Slow connection. · fix: Restyle it to the kit banner with the kit copy (after lite-mode).
- preview scaffolding not shipped: 1 item(s)

### `33_app-states__something-went-wrong`
- **data** (both) — feature `error-reference`: kit: <small> 'Error ref: SW-5F2A' under the actions. · live: No ref line. · fix: error-reference: return the Sentry eventId and render 'Error ref: SW-' + the first 4 hex characters uppercased (the full id goes to support).
- **ui** (both): kit: Ghost 'Contact support' goes to /safety (kit Help & safety). · live: Goes to /support. · fix: Point it at /safety per the kit, provided the live /safety page carries the contact path.
- **ui** (both): kit: Kit real error screen (__root ErrorComponent): wordmark, 'Something went wrong on our side.', 'Nothing you did. · live: The real boundaries are off-kit. · fix: Render the kit error design in both boundaries (with the Error ref from error-reference).
- preview scaffolding not shipped: 1 item(s)

### `34_for-companies__default`
- **ui** (both): kit: Kit .launch-header: max-width 1280, 48px padding, 88px tall, grid auto|1fr|auto. · live: max-w-6xl header, 72px tall, 24px wordmark with the dot touching. · fix: Render the kit header markup verbatim in client/src/pages/ForCompanies.tsx (launch-header/launch-nav/wordmark/brand-button).
- **ui** (both): kit: Each section is a .launch-section: max-width 1180, padding 80px 48px (48px 24px on mobile). · live: One max-w-6xl px-5 main with py-8/py-14 sections. · fix: Wrap each section in the kit launch-section, plus co-hero for the hero, as in app/src/routes/for-companies.tsx.
- **ui** (both): kit: Hero CTAs are kit Button + brand-button: 'Book a demo ->' about 153px wide with smaller type, and an outline 'See pricing' linking to the on-page #pricing anchor. · live: Bare <a class='brand-button'> about 175px wide with larger type. · fix: Use the kit Button asChild + brand-button (outline variant for See pricing) and point See pricing at #pricing.
- **ui** (both): kit: Eyebrow 'PEOPLE OPEN TO REFERRALS AT LAUNCH'. · live: Eyebrow 'REFERRAL DOORS OPEN AT LAUNCH'. · fix: Use the kit copy.
- **data** (both) — feature `company-directory`: kit: Launch company chips come from launchCompanies (SkipWait, Wipro, Go Neutrinos, TCS, Merkle). · live: Chips come from the static client list LAUNCH_COMPANIES (client/src/lib/companies.ts). · fix: Read chips from the DB-backed company directory (companies with open_door status) through GET /api/companies.
- **ui** (both): kit: 'What you get' h2 is clamp(26px,4vw,40px), i.e. · live: text-3xl (30px) h2; · fix: Use the kit moment-grid/moment-card markup.
- **data** (both) — feature `employer-insights`: kit: Value cards 2-4: 'See real demand' (which roles and functions people ask about, aggregated and private, BarChart3 icon), 'Route straight to hiring' (accepted referrals flow into your ATS with the job link and the employe… · live: Replaced with 'Private by default', 'Your team stays in control' and 'Candidates never pay', with Check/ShieldCheck icons. · fix: Restore the kit copy and icons.
- **ui** (both): kit: 'launch-section fair-band co-fair'. · live: Inset rounded band inside the 1112px container. · fix: Use the kit markup and classes verbatim, including the left-flush quirk, and the kit copy.
- **reversal** (both) — feature `employer-plans`: kit: #pricing section 'Start free. · live: The section is missing (founder deviation 'Example pricing section NOT adopted'). · fix: Build the section from a shared employer plan catalog (shared/employerPlans.ts) with the kit plan-grid co-plans markup.
- **ui** (both): kit: .co-demo form: max-width 520, padding 28, gap 14, 26px h2, no subcopy. · live: Extra subcopy 'Opens your email app addressed to our team — nothing is submitted silently.' Pill-shaped inputs with a dark bold placeholder. · fix: Use the kit form markup and the kit options.
- **data** (both) — feature `demo-requests`: kit: The form has required fields, submits, and swaps to a .request-complete success state with a check icon. · live: 'Request demo' is a mailto: anchor. · fix: Call POST /api/demo-requests through a React Query mutation, with pending/error/success states.
- **ui** (both): kit: .launch-footer: max-width 1280, 48px padding, no border. · live: Footer inside main with a border-top, 20px wordmark, small underlined 'Employer workspace' and 'Help & safety' links on one row at the right. · fix: Use the kit launch-footer markup.
- preview scaffolding not shipped: 2 item(s)

### `35_employer__default`
- **ui** (both): kit: Header right side holds only the ghost '<- For companies' button. · live: Also shows the AccountMenu bell and avatar (EmployerFrame.tsx), and the second mobile header line is taller. · fix: Remove AccountMenu from EmployerFrame to match the PNG.
- **data** (both) — feature `employer-referrer-programme`: kit: In-page view nav: Overview / Referrers (UsersRound) / Domains (Globe) / Settings (Settings icon). · live: Route links: Overview / Talent / Roles / Billing (/employer/talent, /employer/opportunities, /employer/billing). · fix: Use the kit's 4 views, as routes /employer, /employer/referrers, /employer/domains, /employer/settings.
- **data** (both) — feature `employer-insights`: kit: h1 'Your referral programme, warmer.' and body '…You see aggregate activity — never individual seekers' private asks.' · live: 'Your hiring, warmer.' and '…You see opt-in talent and your own spend — never individual seekers' private asks.' · fix: Restore the kit copy once the employer workspace has real aggregate programme data.
- **data** (both) — feature `employer-insights`: kit: Stats: Verified referrers 4 / Asks received 23 / Referred 6 / Hired (reported) 1. · live: Unlock credits 18 / Monthly budget $500 / Live roles 3 / Sponsored now 1, from the credit ledger and roles. · fix: Take the stats from GET /api/employer/programme/overview.
- **data** (both) — feature `employer-insights`: kit: 'Asks by function · last 30 days' with Design 11 / Data 8 / Engineering 4. · live: 'Credit activity · last 30 days' with Credits bought / Spent on profile unlocks / Spent on sponsored roles. · fix: Use asksByFunction30d from the overview endpoint.
- preview scaffolding not shipped: 2 item(s)

### `35_employer__just-joined`
- **ui** (both): kit: Header has only the For companies ghost button. · live: AccountMenu bell and avatar added. · fix: Same as the default state: remove from EmployerFrame.
- **data** (both) — feature `employer-domain-verification`: kit: Nav Overview / Referrers / Domains / Settings. · live: Overview / Talent / Roles / Billing. · fix: Kit views backed by the employer programme features.
- **data** (both) — feature `employer-insights`: kit: Zero stats labelled Verified referrers / Asks received / Referred / Hired (reported). · live: Zero stats labelled Unlock credits / Monthly budget ($0) / Live roles / Sponsored now. · fix: Use the overview endpoint values and the kit copy.
- **data** (both) — feature `employer-domain-verification`: kit: Get started steps: 1 'Add your email domains' (opens Domains), 2 'Invite employees to verify' (opens Referrers), 3 'Connect your referral portal (optional)' (opens Settings). · live: 1 'Buy unlock credits' (/employer/billing), 2 'Browse opt-in talent', 3 'Sponsor a role (optional)'. · fix: Use the kit steps, linked to the new Domains/Referrers/Settings views.
- **data** (both) — feature `employer-insights`: kit: Just joined means the programme has no domains, referrers or asks yet. · live: isJustJoined() is true when there are 0 credits, $0 budget, no roles and no spend. · fix: Use justJoined from GET /api/employer/programme/overview: no verified domain and 0 verified referrers.
- preview scaffolding not shipped: 1 item(s)

### `36_admin__default`
- **data** (both) — feature `verification-exceptions`: kit: Verification queue KPI = work-email verification exceptions (unlisted domains, failed re-verification). · live: Count of every verified referrer who has not yet acted (listReferrerEnrollmentsAwaitingAction), captioned 'Referrer enrollments awaiting review'. · fix: Count open workEmailVerificationCases.
- **data** (both) — feature `company-directory`: kit: Company coverage 5 'Confirmed launch companies'. · live: Hard-coded LAUNCH_COMPANIES.length. · fix: Use the count of open_door companies from the directory.
- **data** (both) — feature `admin-overview-metrics`: kit: Marketplace users KPI. · live: Always '—' with 'No fabricated count'. · fix: Add marketplaceUsers {total, seekers, referrers} to the admin overview payload and caption it with the real split.
- **reversal** (both) — feature `employer-plans`: kit: Guardrails: 'Employer subscriptions — Hiring-team workflow and aggregate insights.' / 'Promoted employer profiles — Clearly labeled, never prioritized in referral matching.' / 'Referrals remain free — No commissions or p… · live: 'Employer credits — Talent unlocks…' / 'Sponsored roles' / 'Free requests every month'. · fix: Restore the kit copy.
- **data** (both) — feature `admin-overview-metrics`: kit: Chart: 6 weekly columns W1–W6, legend 'Qualified seeker demand' and 'Available referral supply'. · live: All-time 4-stage funnel from /api/admin/flow-health (requestsCreated / Claimed / Decisions / Waiting). · fix: Add a weekly series (6 x {weekStart, qualifiedDemand, availableSupply}) built from weekly snapshots.
- **ui** (both): kit: Bars are 70% width, primary colour, 4px top radius, no value labels. · live: 45% bars with numeric labels on top. · fix: Render the kit .chart-columns geometry from the weekly data.
- **ui** (both): kit: The page ends after the chart panel. · live: Live-only panels 'COVERAGE GAPS · Company corridors without coverage' and 'TOOLS · Every tool keeps its own audit trail' (6 links to /admin/* pages) follow the chart. · fix: Remove both panels from the overview to match the PNG.
- preview scaffolding not shipped: 1 item(s)

### `36_admin__step1-review-company-submissions-validate-doma`
- **data** (both) — feature `company-directory`: kit: Primary button 'Add company'. · live: 'Submissions' link to /admin-review?tab=companies. · fix: Show 'Add company'.
- **data** (both) — feature `company-directory`: kit: Rows show company, industry, coverage (location) and an 'Open door' status pill. · live: Static LAUNCH_COMPANIES rows, client-side search, every row hard-coded 'Open door', hard-coded 'Five'. · fix: Load from GET /api/admin/companies?q=, with the status pill from directory status (Open door / Joining) and the count in the body copy taken from the data.
- **ui** (both): kit: Ghost 'Review ->' button (inert in the kit). · live: Links to the public /explore/:slug page. · fix: Keep a real target.
- preview scaffolding not shipped: 1 item(s)

### `37_admin-review__default`
- **data** (both) — feature `moderation-actions`: kit: Three severity pills: Urgent (destructive), High (accent yellow, e.g. · live: Only Urgent/Normal, from the reporter-set urgent boolean. · fix: Add a severity column on reports and verification cases, and render High with bg-accent as in the kit.
- **data** (both) — feature `moderation-actions`: kit: Report sub-line 'R-2048 · Seeker -> Referrer · TCS'. · live: Sub-line 'R-2048 · Request #812 · Account #377'. · fix: Extend GET /api/admin/safety-reports with party roles, company name, reported-message excerpt, the reporter's feels-unsafe flag and the prior-warning count, then format the lines as in the kit.
- **data** (both) — feature `moderation-actions`: kit: System-opened case 'Repeated identical asks · Seeker · 14 asks in 1 hour', evidence 'Auto-flag: rate pattern' / 'Same note text ×14', audit 'case opened automatically'. · live: Only user-filed reports exist. · fix: Detect bursts of identical asks via referralRequests.requestFingerprint and open source='auto' report cases.
- **data** (both) — feature `verification-exceptions`: kit: Verification cases: 'Unlisted domain @wipro.co.in · Referrer claims Wipro' (MX records point to Wipro mail servers / domain not on the Wipro allowlist / OTP delivered and confirmed) and 'Re-verify bounced · Merkle · emai… · live: 'Work-email enrollment @domain' for every verified referrer who has not acted yet. · fix: Replace the source with real work-email exception cases.
- **ui** (both): kit: Case refs R-2048, V-311, C-087: the real id, zero-padded to 3 digits. · live: V-1311 / C-1087 (reviewCases.ts adds 1000 to the id). · fix: Format refs as `${prefix}-${String(id).padStart(3,'0')}` in client/src/components/admin/reviewCases.ts.
- **data** (both) — feature `moderation-actions`: kit: Decision tiles. · live: Report: Dismiss, no violation / Mark under review / Resolve with action. · fix: Use the kit decision sets, backed by real server actions (sanctions, allowlist, badge removal, directory approve/merge).
- **ui** (both): kit: Disabled tiles (before a note is typed) are white tiles with a border at opacity-40. · live: Solid grey global button:disabled blocks. · fix: Render disabled tiles as white bordered tiles with muted text and border colours rather than opacity, which matches the PNG without breaking DESIGN.md's 'no faded disabled controls' rule.
- **data** (both) — feature `moderation-actions`: kit: Reviewer note placeholder 'Why this decision? Visible to other reviewers only.' · live: 'Why this decision?' Report and company notes are validated but discarded; · fix: Store notes as per-case events visible to all admins, then use the kit placeholder.
- **data** (both) — feature `moderation-actions`: kit: Decided state: accent card 'Decision: X', 'Parties notified. · live: Outcome text depends on kind ('Reporter notified. · fix: Notify both parties, set appealUntil to now+14d (JS clock), log the event, add POST …/reopen, then use the kit copy.
- **data** (both) — feature `moderation-actions`: kit: Audit trail: '38 min ago · case opened by user report', '38 min ago · escalated to urgent queue', and after a decision 'just now · Ban by reviewer (you)'. · live: 1–3 lines derived from createdAt/updatedAt ('flagged urgent by the reporter', 'marked resolved'). · fix: Render the persisted case event list, with actor shown as 'you', 'reviewer' or 'system'.
- preview scaffolding not shipped: 1 item(s)

### `38_emails__default`
- **data** (both) — feature `email-templates`: kit: Rail: Work-email code, Welcome, Ask accepted, Ask passed, Expiring soon, New ask (referrer), Re-verify, Alert match, Weekly summary, Receipt, Payment failed, Report outcome · live: Work-email code, Welcome, Request claimed, Ask accepted, Ask passed, New message, Waiting for coverage, Slot opened, Review ready, Re-verify reminder, Report outcome, Payment receipt / failed · fix: Add a shared template registry with the kit's 12 keys in kit order, plus real senders for the missing ones (welcome, expiring soon, alert match email, weekly summary, receipt, payment failed, report outcome email).
- **data** (both) — feature `email-templates`: kit: Header shows the rendered subject ('Your SkipWait code: …'); · live: Subject = template name; · fix: Render each template's actual subject, paragraphs and CTA from the same registry the senders use, with typed tokens ({company}, {role}) and no sample values.
- **ui** (both): kit: Code block: 3xl semibold digits with 0.3em tracking · live: '••• •••' renders as small filled squares in Instrument Sans bold · fix: Pick a glyph or weight that renders as round dots (for example font-normal, or the tabular placeholder '— — —'), still with no sample digits.
- **data** (both) — feature `notification-preferences`: kit: Footer: 'Referrals on SkipWait are always free. · live: No 'Manage notifications' · fix: Append a 'Manage notifications' link to /settings#notifications in every email.
- **data** (both) — feature `web-push`: kit: Label 'EMAIL & PUSH TEMPLATES'; · live: 'EMAIL & IN-APP TEMPLATES'; · fix: Build the web-push channel, add a push string to each registry entry, render the push card, and relabel to 'EMAIL & PUSH TEMPLATES'.
- **ui** (both): kit: Nothing below the card · live: Paragraph: 'Twelve templates, each fired by exactly one real event… See in-app updates →' · fix: Remove it.
- preview scaffolding not shipped: 1 item(s)

### `39_guidelines__default`
- **reversal** (both): kit: Summary: 'Never pay or charge for a referral.' / 'Ask for one specific role, honestly.' / 'Passing is always okay. · live: Longer live bullets · fix: In client/src/pages/Guidelines.tsx, use the kit bullets verbatim (owner: Guidelines takes the kit text).
- **reversal** (both): kit: No intro paragraph · live: 'How seekers and referrers treat each other on SkipWait… Breaking these rules can limit or close an account.' · fix: Drop the intro on /guidelines (PolicyPageShell would need an optional intro).
- **reversal** (both): kit: Six sections with the kit bodies (for example '1. · live: Live rewrites (bulleted lists in 2-3, a Report link in 1, Support and email links in 6) · fix: Use the kit section text verbatim, as plain paragraphs.
- **reversal** (both): kit: 'Last updated 6 Oct 2026', no status pill · live: 'Last updated 8 Oct 2026' plus a 'Draft · pending legal review' pill · fix: Remove status='draft'.
- **legal** (both): kit: No bottom link row · live: Policies row (Terms, Guidelines, Privacy, Refunds, Cancellation, Shipping, Pricing, About, Contact, Support) · fix: Keep it: the payment-provider disclosure contract and tests need every policy reachable.
- preview scaffolding not shipped: 2 item(s)

### `40_terms__default`
- **ui** (both): kit: No visible breadcrumb · live: 'Home > Terms of Service' trail (prerendered SEO contract) · fix: Optional owner call.
- **legal** (both): kit: Kit 4 bullets and 7 sections (Who can use, Referrals, Plans/credits, Your content, Conduct, No guarantees, Changes); · live: Live bullets, intro with 'By creating an account… you agree', 11 clauses (including business identity, governing law, grievance officer), 23 Sep 2026 · fix: Keep the live binding text.
- **legal** (both) — feature `kit-pricing`: kit: (kit-pricing world) plans renew monthly or yearly, plan credits roll over · live: Clause 3 says '3 free referral credits each month' and 'Pro and Max plans add a monthly allowance' · fix: When kit-pricing ships, the binding clause 3 must be rewritten for Start/Momentum/Land, yearly billing, $1 credits, rollover, packs and open-ask caps.
- **legal** (both): kit: No bottom row · live: Policies link row · fix: Keep it (payment-provider disclosure).
- preview scaffolding not shipped: 2 item(s)

### `41_privacy__default`
- **legal** (both): kit: Kit summary and 7 sections (one-way work-email fingerprint, no ads, AI tools, GDPR/DPDP, 30-day erasure, international transfers) · live: Live safeguards and disclosures (company-matched, documents private, hosted checkout, what we collect, cookies, retention, account controls) · fix: Keep the live binding text.
- **legal** (both) — feature `blocking`: kit: n/a · live: 'What we collect' and 'Retention' describe today's data only · fix: Blocking (block lists), report evidence snapshots, web-push subscriptions and WorkOS password auth add new data categories or processors.
- **ui** (both): kit: No visible breadcrumb · live: 'Home > Privacy & trust' · fix: The same optional breadcrumb call as Terms.
- **legal** (both): kit: No button · live: Outline 'Open privacy controls' in section 9 · fix: Keep it.
- preview scaffolding not shipped: 1 item(s)

## Feature catalog (merged across screens)

| Feature | Size | Screens | Summary | Owner action |
|---|---|---|---|---|
| `i18n-rtl` | XL | 1 | Translate the app into the kit's 7 languages (en, hi, es, pt, fr, ar, id), with dir=rtl for Arabic, driven by accountPreferences.locale. | Supply or approve the translations for hi/es/pt/fr/ar/id, and approve labelling translated legal summaries non-binding. |
| `kit-pricing` | XL | 16 | For this cluster: asks consume plan open-ask slots instead of a credit (Free 3 / Start 8 / Momentum 15 / Land 30/50/unlimited), with the kit footnote, the sent 'Open slots: X of Y used' and the slot-c… | - Create the Chargebee items and item prices on the TEST site, then LIVE: skipwait_{start/momentum/land_100/land_200/land_500}_{monthly/year…; Create the Chargebee item prices for Start, Momentum and the Land levels (monthly and yearly) and for the credit packs.; Create the Chargebee item prices for Start, Momentum and the Land levels (monthly and yearly, '2 months free');; Create the Chargebee item prices. |
| `mcp-kit-tools` | XL | 4 | Implement the kit tool set on MCP, with the same rules as the app. | — |
| `moderation-actions` | XL | 1 | Full safety-report review per the kit: Urgent/High/Normal severity; | Approve the warning/restriction/ban notification copy, the auto-flag threshold, and the appeal channel (support email or an in-app route). |
| `referrer-tips` | XL | 1 | An optional thank-you tip from seeker to referrer, with 100% going to the referrer. | - Decide whether tips exist at all; |
| `signature-tools` | XL | 1 | The six cards in the /plans 'Signature tools' section, each a real deliverable: - Ask One-Pager: PDF brief, 2 credits, Start+ - Salary & negotiation coach: 5, Momentum+ - Human expert review: written … | - Recruit and contract the human expert reviewers, and set the 48h SLA and refund policy. |
| `work-import` | XL | 2 | 'Import from other platforms': GitHub, Behance, Dribbble, Medium, Personal website and LinkedIn data export. | Register a Dribbble OAuth app (callback https://skipwait.me/api/work-imports/dribbble/callback) and `wrangler secret put DRIBBBLE_CLIENT_ID`… |
| `account-deletion-grace` | L | 1 | Self-serve account deletion: typed DELETE confirm showing real open-ask and credit counts, immediate deactivation, a 14-day grace period cancelled by signing in, then automated withdrawal (referrers t… | Legal confirmation of the 14-day and 30-day windows and of which payment/audit records are retained. |
| `ask-role-location-fit` | L | 2 | Adds the kit's 'Role location' select, the mismatch callout and the 'Location works for you' check on /ask. | — |
| `assistant-approvals-v2` | L | 6 | Approvals carry what the sheet shows: company name, role title, location, provider and connection. | — |
| `assistant-connection-grants` | L | 8 | Make 'Connected assistants' the real consent record. | Decide what in-app /connect-assistant (no OAuth params) Approve should do now that it cannot grant a credential. |
| `blocking` | L | 7 | A person can block another person from a conversation or profile. | Approve the Privacy 'What we collect' amendment covering block lists. |
| `company-directory` | L | 21 | Replace the hard-coded LAUNCH_COMPANIES list (client/src/lib/companies.ts, which mirrors the kit's marketplace-data.ts) with a server-owned company directory. | Approve the initial company and domain list (seed data must match real employer domains).; Confirm the five launch-company domains and that the kit descriptors (blurb, industry, location, functions) are approved as live copy. |
| `credit-metered-tools` | L | 1 | Credits ($1 each) pay for finished work, through one atomic, idempotent spend API that the app and assistants share; | - Approve the per-tool costs. |
| `credit-rollover-ledger` | L | 3 | Ledger for tool credits: - 3 one-time welcome credits after profile completion, once per canonical person. | - Define 'profile complete' for the welcome grant. |
| `developer-app-oauth` | L | 6 | Turn registered developer apps into real OAuth clients: hashed client secret with Rotate, test mode for the owner plus up to 10 test users, a verified badge when live, and a trusted consent with name,… | Approve verifiedOAuthHosts entries (e.g. |
| `developer-webhooks` | L | 3 | Signed webhook delivery to registered apps for ask accepted, passed and message events, plus approval.decided. | wrangler secret put DEVELOPER_WEBHOOK_SIGNING_ROOT and INTERNAL_JOBS_SECRET. |
| `email-templates` | L | 3 | One typed template registry used by every sender and by /emails. | Approve the final email and push wording (FOR_AI_BUILDERS lists email wording as an owner call). |
| `employer-domain-verification` | L | 2 | The employer Domains view lists, adds (with DNS TXT proof) and removes verified email domains. | — |
| `interview-dossier` | L | 2 | Kit paid tool 'Interview dossier' (4 credits, PRICING.md). | — |
| `landed-journey` | L | 3 | Back /landed with the seeker's real hire: role and company, the referrer's first name, the start-date-aware thank-you draft, and the pay-it-forward choice with a one-time reminder. | Decide the pronoun source for 'his private thank-you wall' (optional profile pronouns vs always 'their'). |
| `notification-preferences` | L | 6 | Per-type and per-channel notification settings plus quiet hours, which 'Choose what notifies you' links to. | Confirm the weekly-summary default (kit has it on) and the unsubscribe wording with legal. |
| `open-ask-slots` | L | 3 | Asking is free on every plan, with a cap on concurrent open requests: Free 3, Start 8, Momentum 15, Land 30/50/unlimited, legacy Pro/Max mapped by the owner. | - Approve the economics switch from '3 free requests a month plus $1 per extra request' to free asks with capped concurrency. |
| `paid-tools` | L | 2 | Catalog and execution of credit-priced tools (Ask One-Pager, salary coach, dossier…) so a credit_spend approval or run_tool really debits credits and produces output. | — |
| `password-auth` | L | 5 | First-party email+password sign-in on WorkOS plus forgot/reset password, end to end. | 1. |
| `pinned-work-in-asks` | L | 2 | Pinned work rides along with every referral request: attached at send time (default = the seeker's pinned non-private pieces, up to the plan pin limit), shown to the referrer before acceptance, shown … | — |
| `plan-entitlements` | L | 1 | Enforce the compare-table rows per tier from one shared definition: preparation tool tiers, uploads and memory, research depth, guided workflows (Land), showcase pieces (3/10/unlimited/unlimited), pin… | Define concrete numbers for 'Limited/Expanded/Advanced/Maximum', uploads and memory, and research levels. |
| `pre-accept-question` | L | 3 | The kit 'Ask one question' lets a verified referrer ask the seeker one anonymous question before accepting. | — |
| `public-rest-api-v1` | L | 2 | Public REST API at /api/v1 mirroring the MCP tools for personal tokens (scripts, trackers, spreadsheets), with the same scopes and limits. | — |
| `referral-campaigns` | L | 1 | Backs the kit /for-companies claim 'Run referral campaigns — Rally teams around hard-to-fill roles, with fair rules built in' and the Referral programme plan detail 'run campaigns'. | Decide whether to build campaigns (and provide or approve a design) or treat the claim as a sales-led programme commitment. |
| `referrer-capacity-routing` | L | 6 | Real monthly capacity, pause and function/level matching in ask routing, plus one GET /api/referrer/home read model behind the referrer home states (waiting, expiring, capacity left this month, paused… | — |
| `region-preferences` | L | 1 | Persist language, time zone, currency and date format per account (device-local for guests), and route every time/date/money display in the app and in emails through one formatter. | — |
| `saved-alerts` | L | 3 | Finish kit Saved alerts on the existing seekerAlerts backend: company + function alerts, kit row title, mark and subtitle, Company/Function form, kit footnote with per-plan caps, and per-referrer inst… | Confirm the Start-plan alert cap (the kit footnote names only Free and Momentum/Land; |
| `seeker-search-profile` | L | 3 | Moves the /onboarding answers into the seeker account: goal, target roles, level, city, work countries, remote and work authorization, plus completion. | — |
| `session-management` | L | 1 | A session registry so Settings → Account lists 'Where you're signed in' (device, coarse location, last active, this device), with per-session Sign out and 'Sign out everywhere else'. | Confirm the WorkOS plan exposes the session list/revoke API (WORKOS_API_KEY already exists). |
| `subscription-management` | L | 4 | /billing plan lifecycle: - Upgrade to the next tier through hosted checkout, also used by /plans for active subscribers. | - Enable Chargebee pause and proration settings on the TEST and LIVE sites. |
| `verification-exceptions` | L | 2 | A real work-email exception queue replaces the 'verified referrer without a first action' proxy. | Configure the ZeptoMail bounce webhook URL and secret in the ZeptoMail dashboard. |
| `web-push` | L | 6 | Web Push delivery (after install and permission) for alert matches and other instant notifications, so 'push and email' is true. | Generate a VAPID key pair.; Generate the VAPID keypair.; Generate the VAPID keys and set the secrets. |
| `work-email-reverify` | L | 2 | A 90-day work-email re-verification. | Confirm the 90-day policy and the grandfathering window for existing referrers. |
| `work-items-kit-fields` | L | 2 | Work pieces as the kit models them: kinds Project / Case study / Link / File or image / Write-up; | — |
| `account-deletion` | M | 1 | Cross-cluster (settings): self-serve Settings → Account → Delete account with typed confirmation and a 14-day grace period and undo. | Approve the retention exceptions (payment records) in Privacy. |
| `admin-overview-metrics` | M | 1 | Real values on the admin overview: a Marketplace users total, Company coverage from the directory, and a weekly W1–W6 qualified-demand vs available-supply series for the kit chart. | Decide how to render supply (the PNG draws only demand bars). |
| `approval-notifications` | M | 6 | When an assistant asks for approval, notify the member in Alerts and by web push with a deep link to /approve?id=. | Generate and set the VAPID keys (web-push). |
| `ask-coach-rewrite` | M | 1 | Implements the kit's 'Improve my note · 1 credit': an AI rewrite of the seeker's note for this job link (or a first draft from the profile resume when the note is empty). | — |
| `ask-drafts` | M | 2 | Make the company-door request dialog end the way the kit does. | Approve the replacement paragraph for the completion panel, since the kit's 'In the live product, you would sign in… Nothing was sent from t… |
| `ask-pinned-work` | M | 1 | Lets a seeker pin work items to an ask, as in the kit's pinned-work chip. | — |
| `ask-provenance` | M | 3 | Record which assistant helped send an ask and show referrers 'Sent with <assistant>' ('Sent via ChatGPT by Asha'). | — |
| `ask-quality-checks` | M | 5 | Runs the /ask quality checks on the server too, as CHECKLIST and FOR_AI_BUILDERS require: one shared implementation for client and server, the kit's send gate enforced, and a stored quality snapshot. | Decide whether a failed quality check blocks sending or only warns. |
| `ask-quality-signals` | M | 3 | Compute ask strength and the quality checks server-side when an ask is created, and expose the job title, strength, quality chips and a fit-note excerpt on referrer inbox rows. | — |
| `ask-send-limits` | M | 5 | The 'same limits as people' rules for UI and assistants: per-plan open-request slot caps (kit-pricing), a daily send cap and duplicate-ask detection, enforced durably. | Set the daily send cap N (AGENT_ACCESS: 'Max N sends/day per user (same as UI)'). |
| `billing-dunning` | M | 1 | Record failed renewal payments and show the payment-issue panel until the invoice is paid: 'Your last payment failed. | - Configure the Chargebee dunning retry schedule and final action on TEST and LIVE. |
| `billing-invoices` | M | 4 | Receipts list every paid invoice: subscription charges ('Momentum · monthly') and credit packs ('25 credits'). | Make sure the Chargebee webhook sends the invoice and refund events. |
| `billing-payment-methods` | M | 4 | The Payment method panel lists the customer's saved Chargebee payment sources: card brand, last 4 digits and expiry; | - Confirm the Razorpay gateway on Chargebee has UPI AutoPay, netbanking, wallets and cards enabled, and PayPal Express is enabled outside In… |
| `company-suggestion-review` | M | 2 | Make the suggest-company promises real: a 2-day review SLA, auto-listing when a verified referrer joins on the suggested domain, 'now live' notifications, and duplicate detection against the real comp… | Commit to the 2-day review SLA. |
| `context-nudges` | M | 1 | The 'Help, in context' section on /plans: four per-user moment cards with Try it / Not now, filled from the user's own data, never kit samples: - Ask coach while writing an ask - Company-opening alert… | — |
| `credit-packs` | M | 2 | Sell the kit credit packs: 5 for $5, 25 for $22 ('Most chosen' from data), 60 for $48 and 150 for $105, plus INR equivalents. | - Create one-time-charge pack item prices in USD and INR on the Chargebee TEST and LIVE sites. |
| `data-export-async` | M | 1 | 'Request export' creates an asynchronous export request. | Approve a ZIP writer dependency or a native implementation (zlib deflateRaw plus a hand-written container). |
| `demo-requests` | M | 1 | The /for-companies 'Book a 20-minute demo' form actually submits: Zod-validated, rate-limited, stored, emailed to the sales inbox, and shown with the kit success state. | Choose the inbox for DEMO_REQUEST_NOTIFY_EMAIL. |
| `developer-app-review-admin` | M | 4 | Admin review lifecycle for developer apps: approve, reject with reasons, suspend with a stored reason and reinstate. | Publish developer terms text (legal). |
| `employer-insights` | M | 3 | Aggregate employer overview: Verified referrers, Asks received, Referred and Hired (reported), plus 'Asks by function · last 30 days' and a data-driven just-joined state. | Gating decision (see employer-plans) and minimum-count threshold (see employer-referrer-programme). |
| `employer-plans` | M | 2 | The kit company plans become real entitlements: Company page (free), Referral programme (from $199/mo, sales-led through Book a demo) and Enterprise (talk to us). | In Chargebee (test site, then live), create the employer item price(s) for 'Referral programme': USD 199/month, plus yearly if wanted. |
| `employer-programme-settings` | M | 3 | Employer Settings view with three toggles: link your referral portal (referrers get a one-tap link to the company's internal referral form), monthly aggregate activity digest, and show company story o… | Approve the ZeptoMail digest template. |
| `employer-referrer-programme` | M | 2 | The employer Referrers view shows verified employee referrers by function only (count plus Active/Paused), a 'Copy invite link' and 'Invite by email'. | Approve the ZeptoMail invite template and sender. |
| `function-taxonomy` | M | 16 | One shared list of functions (teams), with mappings from roles and posting titles, used by onboarding roles, referrer preferAreas, alerts and function-scoped ask routing. | Approve the function list. |
| `kit-markup-companies-employer-admin` | M | 5 | UI-only port of this cluster to the kit markup and copy: ForCompanies onto the kit classes, plus EmployerFrame, AdminOverviewView and reviewCases tidy-ups. | Confirm three things: dropping the bell/avatar from the employer header, removing the Tools/Coverage-gaps panels from /admin, and the wordin… |
| `lite-mode` | M | 1 | A real 'lighter version' on slow or save-data connections, so the kit slow-connection banner copy is true. | — |
| `multi-currency-pricing` | M | 1 | Server price catalog of the kit tiers per currency (USD/INR/EUR/GBP/AED) from Chargebee item prices, feeding the Settings 'Momentum shows as …/month' note and the currency options. | Enable multi-currency on the Chargebee site and create item prices for Start/Momentum/Land (monthly and yearly) in each offered currency (EU… |
| `named-referrer-visibility` | M | 2 | Make the stored referrerVisibility mean something. | — |
| `notification-kinds` | M | 2 | Make notifications event-aware so /alerts can show kit icons, kit copy and the right destination. | — |
| `notification-reminder-jobs` | M | 1 | Generate the two kit notifications that nothing produces today: 'Ask expires in 1 day' and '{n} plan credits expire {Weekday}'. | — |
| `offline-draft-sync` | M | 2 | Asks and messages the user confirms while offline are queued on the device and sent automatically on reconnect with idempotency. | — |
| `pass-reasons` | M | 2 | Kit Pass privately: 5 reasons (Not my team or function, Role needs more experience, Not enough context, At capacity right now, Prefer not to say). | Confirm the routing change: today a pass leaves the ask open to other verified employees at that company; |
| `payment-failure-recovery` | M | 1 | A real 'Payment didn't go through' state after a failed checkout, driven by the recorded provider failure (reason, charged, plan unchanged), with 'Try another card' and UPI recovery. | Ensure the Chargebee and Razorpay webhooks include the failure events (dashboard webhook event selection). |
| `profile-resume` | M | 4 | Gives the account one reusable 'resume on file'. | — |
| `profile-view-insights` | M | 1 | 'Private view insights' is advertised as a Momentum perk in the /work nudge and plan card, so it must exist: privacy-preserving daily view counts of a person's public profile, visible only to the owne… | Decide where insights render, or remove 'private insights' from the plan and nudge copy. |
| `public-profile-kit` | M | 1 | Bring /p/:handle to the kit. | Approve the blurb wording for the no-areas case (suggest 'Open to referrals at <Company>.'). |
| `referrer-identity-reveal` | M | 3 | Kit and CHECKLIST rule: after Accept both sides see names. | — |
| `safety-report-review` | M | 5 | Make the report promises real: derive the reported person from the conversation, snapshot the relevant messages as evidence, track the 4h/48h SLA with admin alerts, persist the reviewer note, and send… | Staff and commit to the 4h urgent and 48h normal review SLA. |
| `scheduled-jobs` | M | 13 | A durable periodic job runner, since none exists today: a Cloudflare Worker cron triggers an authenticated internal endpoint on the container. | Run 'wrangler secret put INTERNAL_JOBS_SECRET' with a random value.; Run 'wrangler secret put INTERNAL_JOB_SECRET' (or approve CI to set it).; Run `wrangler secret put INTERNAL_JOBS_SECRET`.; Run `wrangler secret put INTERNAL_JOB_SECRET`.; Set INTERNAL_JOB_SECRET with wrangler secret put. |
| `seeker-work-links` | M | 2 | Implements the onboarding Work step's kit 'Connect' for LinkedIn, GitHub, Portfolio site and Behance/Dribbble. | — |
| `settings-kit-shell` | M | 1 | Rebuild /settings as the kit 5-section page (Region, Notifications, App, Privacy, Account) in the kit Heading/Panel/Toggle style, working signed out with device-local Region. | — |
| `showcase-plan-limits` | M | 2 | Plan-driven showcase entitlements from the kit tiers: piece and pin caps, the custom profile link (Momentum+) with automatic handles for everyone else, the Plus chip, the 'Pin limit' state, and the 'S… | Decide: (1) Free piece limit. |
| `thank-you-wall` | M | 6 | Persist the seeker's thank-you. | — |
| `thread-timeline` | M | 1 | System lines in the thread (accepted, referred with reference, seeker milestones, question asked or answered) come from durable transition events instead of client-only text. | — |
| `upgrade-nudges` | M | 1 | Two parts: - Usage panel: the user's own open slots, credits used and plan credits expiring, each with a meter. | — |
| `upi-checkout` | M | 1 | 'Pay with UPI' for the INR route (Razorpay gateway), as an alternative after a card failure and in checkout. | Enable UPI (and UPI AutoPay for recurring plans) in the Razorpay dashboard and in the Chargebee Razorpay gateway's payment methods. |
| `work-email-hmac-storage` | M | 3 | Store only a keyed HMAC of work emails in the verification tables and purge plaintext, so the verify aside's 'A one-way fingerprint of your email' is true. | Generate the key and set it with 'wrangler secret put WORK_EMAIL_HMAC_KEY'. |
| `work-visibility-tiers` | M | 2 | Per-piece visibility Public / Only referrers I ask / Only me (kit), replacing the boolean visibleOnProfile. | — |
| `app-display-preferences` | S | 1 | Settings → App Dark mode (sw-theme, defaulting to the system setting) and a Reduce motion override, using the existing .dark tokens. | Choose whether the Dark mode hint keeps the kit wording 'Preview — some older screens are still being tuned'. |
| `ask-company-context` | S | 1 | Resolves the company and team (function) the seeker is asking about before sending, for the kit eyebrow 'NEW ASK · WIPRO · DESIGN', the careers-domain placeholder, function-scoped routing and the sent… | — |
| `assistant-land-entitlement` | S | 4 | Gate assistants, tokens, OAuth and the developer console on the kit Land tier (Land / Land Sprint / Land Concierge) instead of the live 'max' plan, and switch all Max copy to Land. | Decide whether existing Max subscribers keep assistant access. |
| `company-demand` | S | 1 | Seeker 'Request a company' becomes a counted demand signal with an optional work function. | — |
| `developer-app-usage-stats` | S | 1 | Real per-app counts on App details: connected users, asks sent via the app, approval rate. | — |
| `error-reference` | S | 1 | Real error references on error screens, from the Sentry event id or a server-logged client ref, plus the kit error design in the real boundaries. | — |
| `explore-kit-polish` | S | 4 | Markup and copy fixes so the explore screens match the kit: 'Request a company' links to /invite; | — |
| `guidelines-kit-text` | S | 3 | /guidelines switches to the kit text verbatim and drops the draft status and intro. | Confirm the publication date and that the kit Guidelines are final (they were 'pending legal review'). |
| `identity-gated-preview` | S | 1 | Hide the seeker's name from the referrer until they accept, so the queue card's 'Identity hidden / Shared after you accept the request' is true. | — |
| `inbox-list-enrichment` | S | 1 | The referrer-side inbox rows show the job title ('UX Researcher · New ask for you to review') instead of the company name. | — |
| `kit-placeholder-color` | S | 3 | Global: the legacy rule `::placeholder { color: #505050; | Accept the kit placeholder contrast. |
| `landing-kit-fidelity` | S | 1 | Bring the landing page (/) back in line with the PNG: undo the founder-call deviations from e2e6e0a (trust strip removed, desktop door shown whole), remove the additions that aren't in the PNG (Safety… | — |
| `mark-referred-reference` | S | 2 | Mark as referred takes an optional portal reference ID that the seeker sees. | — |
| `mcp-public-endpoint` | S | 3 | Serve MCP at the kit address https://skipwait.me/mcp (keeping /api/mcp working for existing connectors) and update the OAuth resource metadata. | Confirm the CI CLOUDFLARE_API_TOKEN can edit Worker routes on the skipwait.me zone (it already deploys skipwait.me/api/*). |
| `otp-policy-kit` | S | 1 | Bring work-email OTP to the kit and spec policy: a 30s resend cooldown, a 15-minute lockout after 5 failed attempts, and server-authoritative retry, attempt and lock state. | — |
| `privacy-consent-controls` | S | 1 | Settings → Privacy 'Cookies & analytics' toggles (Essential locked, Product analytics, Error reports), stored on the device and actually gating Clarity and client Sentry. | Confirm the cookie/privacy notice covers the 'error reports' category (legal text stays the binding live text). |
| `profile-display-name` | S | 4 | An editable display name on /profile that survives sign-in. | — |
| `profile-fields-relocation` | S | 3 | Make /profile exactly the kit form (Display name, Headline, Resume or Company, Save) and give every live-only field its kit home, reversing the founder call that kept all of main's fields in the form. | Confirm that bio, skills and current title disappear from public pages for users who filled them in (the data is kept and exported), or name… |
| `pwa-install` | S | 3 | Make the kit install sheets real product moments: capture beforeinstallprompt globally, offer Android or iPhone install from Settings → App and after the first ask is sent, and show 'Installed' in sta… | — |
| `referrer-impact-metrics` | S | 1 | Server counts behind the kit Impact labels: introductions, active conversations and outcomes shared. | — |
| `referrer-preview-expiry` | S | 2 | The referrer-pending thread shows 'Expires in N days.' before 'No reply needed to pass — but a quick answer helps.' | — |
| `referrer-profile-headline` | S | 2 | A separate referrer headline (function at work) for the Referrer profile tab and the public referrer variant. | — |
| `sign-in-intent-routing` | S | 2 | Make the kit sign-in page's controls work: the Find/Give a referral intent decides where the person lands after sign-in, 'Continue with Google' goes straight to Google, 'Create a free account' opens s… | Confirm the Google OAuth connection is enabled in WorkOS (AuthKit uses it today). |
| `trust-ui-pass` | S | 8 | Markup and style fixes only, across the trust and legal screens. | Rule on the disabled-button conflict (DESIGN.md 'no opacity-faded disabled' vs the kit PNG faded blue) and on the global placeholder colour. |

## Build plan (dependency order; each wave ships to `main` per verified group)

| Wave | Scope | Features |
|---|---|---|
| 1 | UI fidelity + founder-call reversals (no schema) | `landing-kit-fidelity`, `sign-in-intent-routing`, `explore-kit-polish`, `kit-placeholder-color`, `trust-ui-pass`, `guidelines-kit-text`, `settings-kit-shell`, `kit-markup-companies-employer-admin`, `profile-fields-relocation`, `profile-display-name`, `referrer-profile-headline`, `public-profile-kit`, requests/inbox/thread row fixes |
| 2 | Shared foundations | `company-directory`, `function-taxonomy`, `scheduled-jobs` |
| 3 | Kit pricing | `kit-pricing`, `open-ask-slots`, `plan-entitlements`, `credit-rollover-ledger`, `credit-packs`, `subscription-management`, `billing-payment-methods`, `billing-dunning`, `billing-invoices`, `payment-failure-recovery`, `upgrade-nudges`, `context-nudges`, `assistant-land-entitlement`, `showcase-plan-limits` |
| 4 | Accounts and asks | `password-auth`, `seeker-search-profile`, `profile-resume`, `seeker-work-links`, `ask-company-context`, `ask-quality-checks`, `ask-role-location-fit`, `ask-drafts`, `ask-pinned-work` / `pinned-work-in-asks`, `credit-metered-tools`, `ask-coach-rewrite` |
| 5 | Referral lifecycle | `referrer-identity-reveal`, `identity-gated-preview`, `pre-accept-question`, `pass-reasons`, `mark-referred-reference`, `thread-timeline`, `inbox-list-enrichment`, `referrer-preview-expiry`, `ask-quality-signals`, `referrer-capacity-routing`, `named-referrer-visibility`, `referrer-impact-metrics`, `company-demand`, `landed-journey`, `thank-you-wall` |
| 6 | Notifications | `notification-kinds`, `notification-preferences`, `notification-reminder-jobs`, `web-push`, `approval-notifications`, `email-templates`, `saved-alerts` (function field) |
| 7 | Trust, safety, account | `blocking`, `safety-report-review`, `moderation-actions`, `company-suggestion-review`, `verification-exceptions`, `work-email-reverify`, `work-email-hmac-storage`, `otp-policy-kit`, `account-deletion`/`account-deletion-grace`, `session-management`, `data-export-async`, `privacy-consent-controls`, `region-preferences`, `app-display-preferences`, `pwa-install`, `offline-draft-sync`, `error-reference`, `lite-mode` |
| 8 | Assistants and developers | `assistant-connection-grants`, `assistant-approvals-v2`, `ask-provenance`, `ask-send-limits`, `paid-tools`, `developer-app-oauth`, `developer-app-review-admin`, `developer-app-usage-stats`, `developer-webhooks`, `mcp-kit-tools`, `mcp-public-endpoint`, `public-rest-api-v1` |
| 9 | Companies, employer, admin | `demo-requests`, `employer-domain-verification`, `employer-referrer-programme`, `employer-insights`, `employer-programme-settings`, `admin-overview-metrics`, `employer-plans` |
| 10 | Work and tools | `work-visibility-tiers`, `work-items-kit-fields`, `profile-view-insights`, `interview-dossier`, `signature-tools` (minus human review) |

### Needs an owner decision before it is built
- `referrer-tips`: seeker → referrer tips need a payout provider, KYC and tax review, and contradict SCREENS.md `/landed` ("no gifts/payments"). Build or drop the copy?
- `signature-tools` "Human expert review": needs contracted reviewers and a 48h SLA.
- `i18n-rtl`: the 6 non-English languages need supplied or approved translations (and an i18n dependency approval). Locale formatting and RTL direction can ship without them.
- `referral-campaigns`: no kit screen exists; build a design or treat as sales-led.
- Per-tool credit costs (PRICING.md vs PNG values) and which plan the Free slots-full nudge names (PNG "Momentum (8)" vs PRICING.md Start 8).

### Owner-only provider setup (code ships behind these and says so until done)
- Chargebee: item prices for Start, Momentum, Land levels (monthly + yearly), employer "Referral programme", and any extra currencies.
- WorkOS: enable Email + Password authentication.
- Web push: `wrangler secret put VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (keys generated with the release).
- Razorpay/Chargebee: enable UPI (and UPI AutoPay) for the INR route.
- Work import: Dribbble OAuth app + secrets; optional GitHub read token.
