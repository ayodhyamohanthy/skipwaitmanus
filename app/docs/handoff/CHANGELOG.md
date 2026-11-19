# Design changelog (newest first)
- Plans: added "Your usage this cycle" panel and limit-triggered upgrade moments (UPGRADE_NUDGES.md).
- Plans renamed Start / Momentum / Land; credit rollover row + FAQ; signature tools section.
- Credits merged into /plans; Add credits modal; /wallet redirects to /plans.
- Free card removed; in-card Monthly/Yearly; plans at top of page.
- Navigation: Profile, My work, Plans & credits in sidebar/tabs; More = Help & safety, For companies; Admin only via /admin.
- Added /work showcase and standalone /for-companies.

- Added `/verify` (work-email OTP verification), `/thread` (request thread + referrer decision flows), `/p/$handle` (public shareable profile). Linked from referrer setup, referrer queue, and Profile.
- Added /onboarding, /ask, /alerts, /landed, /referrer-home, /report, /settings, /app-states, /admin-review; top-bar alerts bell.
- Added /referrer-setup, /help, /employer, /emails, /terms, /privacy, /guidelines; redesigned /inbox; branded 404/error; dark mode toggle; alerts bell on phone; full phone+desktop overflow audit of 35 pages passed.
- Dark mode tuned across all screens (yellow kept as secondary, neutral accent, homepage door band stays light). Accessibility pass on 34 pages in dark mode: buttons/links named, images have alt text, form fields labelled, tap targets ≥ 24px (one fixed).
- Added /forgot-password, /reset-password, /suggest-company, /billing; redesigned /requests.
- Added FOR_AI_BUILDERS.md (single entry point for AI builders). Refer nav now opens /referrer-home; billing/emails use USD by default.

- Added approved production stack (WorkOS, Chargebee, Razorpay, PayPal, Cloudflare, Azure, Customer.io, Zoho, PostHog/Mixpanel, Statsig, Sentry, Datadog/New Relic) to FOR_AI_BUILDERS.md. Designs: cookie consent banner on homepage, Cookies & analytics in /settings Privacy, UPI/PayPal payment methods in /billing, employer SSO toggle.

- Clarified: work email is never a sign-in method; it is verified by OTP sent through ZeptoMail. Removed employer SSO toggle.

- Added AGENT_ACCESS.md: MCP/API access for assistants (Land plan), human-confirmed sends, referrers never automated.

- Designed assistant access: /connect-assistant (consent, 6 states), /assistants (connected, API tokens, activity), /approve (phone approval sheet), /developers. Land/Momentum features updated; Settings links to assistants.

- Assistant/bot/API access restricted to Land and Concierge (removed Momentum read-only).

- Opened platform to third-party apps/agents/MCP clients: /developer-console, unverified-app consent state, developers page updated.

- Kit v4 assembled: START_HERE.md with live-platform update instructions, full screens PDF with all states, refreshed source.
