# Project TODO

- [x] Define the role-aware data model for Job Seeker, Referrer, job listings, saved roles, Referral Request records, messages, notifications, and application status tracking.
- [x] Implement authentication-aware onboarding with the exact role choices “Job Seeker” and “Referrer”.
- [x] Build the public landing page with hero, how-it-works, dual calls-to-action, testimonials, and footer.
- [x] Build the Job Listings browse and search page with role, company, location, seniority filters, and compatibility indicators.
- [x] Build the Community and Explore page with available Referrers by company and role plus search and filtering.
- [x] Build the Job Seeker dashboard with saved roles, active Referral Request items, and application status tracking.
- [x] Build the Referrer dashboard with incoming Referral Request items, candidate profiles, and Referral Impact Metrics.
- [x] Build the Referral Request creation flow with role selection, personal pitch, and referrer recipient.
- [x] Build the Referrer review page with candidate profile, skills match, approve or decline actions, and optional message.
- [x] Build distinct profile pages for Job Seekers (resume, skills, experience) and Referrers (company, expertise, referral capacity).
- [x] Build the messaging and notifications center for referral status updates and direct communication.
- [x] Apply a refined, professional, accessible visual system across every page and interaction.
- [x] Add unit tests covering referral state behavior and key backend contracts.
- [x] Verify all primary routes at desktop and mobile breakpoints, then save the completed project checkpoint.
- [x] Persist authenticated onboarding, profile updates, saved roles, Referral Requests, referral reviews, messages, and notifications through the platform backend.
- [x] Connect the Job Listings, Community and Explore, and both dashboards to live backend queries while retaining safe empty states.
- [x] Add explicit role filters to Job Listings and Community and Explore, plus a verified-member community section on the landing page without fabricated testimonials.
- [x] Extend tests for role-aware referral backend contracts and re-verify the completed platform before checkpointing.
- [x] Persist saved-role actions from Job Listings and synchronize their state with the signed-in Job Seeker’s saved roles.
- [x] Replace discovery and dashboard demo fallbacks with loading, error, and genuine empty states when live data is available.
- [x] Restrict live dashboard Referral Request lists to the relevant Job Seeker or Referrer perspective.
- [x] Add explicit query error states to Job Listings, Community and Explore, and both dashboards for failed live backend requests.
- [x] Surface saved-role query and mutation failures directly in Job Listings.
- [x] Surface Referral Request and saved-role query failures directly in both role-aware dashboards.
- [x] Reframe Bridge around an AI-native career copilot rather than conventional dashboard navigation.
- [x] Build a conversational AI workspace for Job Seekers with guided job discovery, opportunity reasoning, and career-planning prompts.
- [x] Add AI-powered referral matching that explains fit, identifies the best Referrer, and proposes a respectful introduction strategy.
- [x] Replace the static Referral Request experience with a guided AI drafting flow that adapts the personal pitch to the role and recipient.
- [x] Add an AI-native Referrer workspace that summarizes candidate context, surfaces key fit signals, and supports thoughtful review decisions.
- [x] Add proactive AI briefing cards for message preparation, application next steps, and referral-status changes.
- [x] Verify the redesigned AI-native experience at desktop and mobile breakpoints, then save an updated checkpoint.
- [x] Ground Copilot guidance in live Job Listings, available Referrers, profile context, and active Referral Request data.
- [x] Implement AI referral matching that ranks available Referrers, explains the fit, and proposes an introduction strategy for a selected role.
- [x] Generate proactive AI briefings from live messages, Referral Request status, and saved-role data rather than static dashboard copy.
- [x] Re-verify the data-grounded AI-native experience and save a post-redesign checkpoint.
- [x] Reduce the product prototype to a conversion-focused landing page, role onboarding, and AI-assisted referral flow.
- [x] Create a premium MVP landing narrative with a clear paid value proposition and high-intent conversion calls to action.
- [x] Rebuild onboarding as a fast role-and-goal setup that leads directly to a personalized referral pathway.
- [x] Create a full-length AI-assisted referral journey from opportunity selection through matching, request drafting, review, and confirmation.
- [x] Add an MVP monetization moment that clearly demonstrates paid value without interrupting the core referral experience.
- [x] Validate the complete prototype journey at desktop and mobile breakpoints, then save the focused MVP checkpoint.
- [x] Restrict public MVP navigation to landing, onboarding, referral path, and Referrer review while retaining only necessary hidden prototype routes.
- [x] Persist the selected target role and company through onboarding into the personalized referral path.
- [x] Replace the hardcoded opportunity handoff with an onboarding-driven referral route that carries matching, drafting, review, and confirmation context end to end.
- [x] Re-verify the truly focused MVP experience and save the post-MVP checkpoint.
- [x] Read the onboarding target and company route parameters throughout the Referral Request flow and its final confirmation.
- [x] Connect the Referrer review prototype to the current referral path using selected-opportunity context rather than a hardcoded review route.
- [x] Re-verify the finished context-driven MVP routes and save the final post-MVP checkpoint.
- [x] Show the selected target and company in the Referral Request confirmation state.
- [x] Replace remaining hardcoded review entry points with the active referral context handoff.
- [x] Save a final checkpoint after the complete MVP handoff is verified.
- [x] Replace the landing Referrer entry with the context-driven MVP review handoff and save the final checkpoint.
- [x] Remove all non-essential product screens, pricing concepts, AI briefing, review flows, and secondary navigation from the active prototype.
- [x] Reduce onboarding to minimal name, target role, and company capture.
- [x] Reduce the referral experience to one clear selected role, one suggested Referrer, an editable request, and a simple sent confirmation.
- [x] Verify the three-screen minimal MVP at desktop and mobile breakpoints, then save a new checkpoint.
- [x] Add a clear “I give referrals” entry point to the landing page.
- [x] Build a focused Referrer review screen showing one incoming request, candidate context, and the selected opportunity.
- [x] Add approve and decline actions with an optional response message and a clear decision confirmation state.
- [x] Verify the Job Seeker and Referrer flows at desktop and mobile breakpoints, then save an updated checkpoint.
- [x] Define token packages, balance rules, and direct referral request pricing for the premium flow.
- [x] Enable secure payment checkout and document storage infrastructure.
- [x] Add token balance and transaction records plus attachment metadata to the platform data model.
- [x] Build a token purchase and balance experience for Job Seekers and Referrers.
- [x] Require and deduct tokens for direct referral requests, with clear balance and insufficiency states.
- [x] Add secure resume and document attachment upload, display, and access controls to referral request workflows.
- [x] Test payment-ready token, direct-request, and document attachment flows, then save an updated checkpoint.
- [x] Replace the Stripe-specific token purchase plan with Razorpay, Chargebee, and PayPal provider roles.
- [x] Audit the Razorpay and Chargebee credentials, webhooks, and provider-specific checkout contracts; PayPal remains intentionally deferred until a PayPal sandbox account is connected.
- [x] Credit token balances only after verified Chargebee payment events through the single USD hosted-checkout route; Razorpay and PayPal remain gateway options behind Chargebee rather than separate UI routes.
- [x] Configure and consult the supplied Chargebee knowledge endpoint before implementing the Chargebee token-purchase contract.
- [x] Keep checkout simulated and present the premium token, direct-request, and document-attachment experience for design approval before enabling providers.
- [x] Replace token packs with a 3-free-token allowance and a simple $1-per-additional-token policy.
- [x] Show a clear free-token balance, 1-token application cost, and exhausted-balance repurchase state.
- [x] Verify the simplified free-to-paid token transition and present the updated design flow.
- [x] Replace the applicant Target Role field with a Target Role URL input and preserve it through the direct referral request context.
- [x] Add a visible Referrer token wallet, showing starting balance, earned tokens, and the reward rule.
- [x] Credit the simulated Referrer wallet when an incoming direct referral request is approved and show a clear decision confirmation.
- [x] Verify the Job Seeker spend and Referrer earn sides of the token system together.
- [x] Give Referrers the same 3-free-token allowance, $1 repurchase path, and explicit 1-token direct-action cost as Job Seekers.
- [x] Separate the Referrer wallet’s paid/free token balance from any referral-reward messaging.
- [x] Verify both role-specific token purchase and exhaustion experiences together.
- [x] Show the Referrer’s free token allowance and purchased token balance as distinct wallet categories, then re-verify its top-up flow.
- [x] Carry the Job Seeker’s selected resume or document into the Referrer review experience with a visible file card and open action.
- [x] Display attached resumes directly within the Referrer review and provide a separate download action for the original file.
- [x] Restrict inline resume preview uploads to PDF and image formats, and provide a download-only fallback for other document formats.
- [x] Keep a visible $1 token top-up control available in Job Seeker and Referrer wallets, including after a simulated purchase.
- [x] Replace general referral-request copy with an editable, exact employee-to-hiring-manager referral email draft tied to the Target Role URL.
- [x] Add an accomplishment prompt using the formula “accomplished X + measured by Y + by doing Z” to strengthen the employee referral email.
- [x] Remove referral email drafting from the Job Seeker flow and show the exact referral email editor, including the accomplishment formula, within Referrer review.
- [x] Remove the floating token purchase control and integrate the $1 top-up action within Job Seeker Application Tokens and Referrer Wallet panels.
- [x] Simplify the Job Seeker onboarding helper copy about resume attachment and Referrer email ownership.
- [x] Reduce Job Seeker onboarding to the essential fields and a single clear request action.
- [x] Make Job Seeker entry job-link-first, defer nonessential context, and reduce the request path to the fewest decisions possible.
- [x] Restore name-and-job-link onboarding with compact, credible trust cues while keeping the fast request path.
- [x] Raise onboarding and post-request experiences to a premium, credible product standard without adding decision friction.
- [x] Require at least one resume or supporting document, support multiple Job Seeker uploads, and show an add-another-document action after attachment.
- [x] Reset the Job Seeker display to three included application tokens and clarify that extra requests cost $1 per added token.
- [x] Rebalance the Job Seeker request interface to retain trust and guidance with less visual and copy density.
- [x] Rebrand active UI and browser metadata from Bridge to skipwait.me.
- [x] Add responsive PWA installability, offline resilience, device language defaults, and a privacy-safe persistent session experience.
- [x] Add explicit privacy-safe PWA session continuity using the existing secure OAuth session and browser credential support where available.
- [x] Preserve lightweight in-progress referral request state for offline recovery and show a clear offline fallback state.
- [x] Add code-level tests for PWA device, session, and offline recovery behavior.
- [x] Add credential-capability and secure-session restoration tests for the PWA fallback path.
- [x] Add a user-triggered saved-device sign-in mediation path that falls back safely to OAuth without storing browser credentials.
- [x] Test focus, online, and visibility-triggered secure-session restoration behavior.
- [x] Rewrite the landing page with compelling, credible conversion copy for both Job Seekers and Referrers.
- [x] Replace the violet-heavy visual treatment with a restrained, premium neutral system across active skipwait.me flows.
- [x] Apply an original Sarvam-inspired warm editorial visual direction with saffron accents, rounded serif-led typography, and generous whitespace across active flows. Superseded by the later enterprise productivity direction.
- [x] Apply the warm editorial typography, spacing, and premium hierarchy directly in Onboarding, ReferralRequest, Referrer, and Premium screens. Superseded by the later enterprise productivity direction.
- [x] Verify the saffron accent system, serif-led headings, spacing, and responsive hierarchy on every active screen with visual QA evidence. Superseded by the later enterprise productivity direction.
- [x] Redesign the mobile landing page around clear, touch-friendly Job Seeker and Referrer entry actions with concise motivating copy.
- [x] Replace the warm editorial styling with an original enterprise productivity design system featuring clear action hierarchy, restrained surfaces, and role-specific referral conversion paths.
- [x] Apply the final enterprise productivity hierarchy directly in Onboarding, ReferralRequest, Referrer, and Premium without depending primarily on global color remapping.
- [x] Capture route-by-route desktop and mobile visual QA for /, /start, /request, /referrer, and /premium using the final enterprise design.
- [x] Refactor ReferralRequest and Referrer with direct enterprise blue/slate card, button, heading, and panel classes instead of broad color remapping.
- [x] Re-run desktop and mobile visual QA after the direct enterprise refactor of /request and /referrer.
- [x] Refine mobile landing copy and first-screen role actions so Job Seekers and Referrers are more strongly encouraged to enter their flows.
- [x] Remove nonessential mobile landing content so the first view presents only a concise referral promise and two role actions.
- [x] Add an AI-assisted, editable hiring-manager email draft in Referrer review that uses only the supplied candidate, role, and accomplishment context.
- [x] Add an explicit exhausted-token state with a visible $1-per-token repurchase action for Job Seekers.
- [x] Add an explicit insufficient-token explanation and $1-per-token repurchase action in the Referrer wallet.
- [x] Verify the complete free-to-zero-to-purchase-to-usable-again transition for both roles.
- [x] Add automated route-level coverage for the Job Seeker and Referrer zero-balance, top-up, and usable-again paths.
- [x] Verify the existing Clerk configuration and integrate it as the secure sign-in authority for resume upload and Referrer review.
- [x] Persist secure document ownership and referral linkage so only the Job Seeker and assigned Referrer can access a resume.
- [x] Connect the active Job Seeker submit flow to backend referral creation with uploaded attachment identifiers.
- [x] Load Referrer documents from the assigned backend referral request instead of local storage.
- [x] Add integration coverage for Clerk-secured upload, referral linkage, authorized review, and unrelated-user denial using injectable route dependencies; real Clerk/database E2E remains a separate environment-dependent validation.
- [x] Verify employee work email domains and maintain a hidden eligible-employee pool by company.
- [x] Route a Job Seeker’s Target Role URL request to the matching company’s eligible signed-in employees without exposing their identities.
- [x] Notify eligible employees about matching company requests and let exactly one employee claim the referral request.
- [x] Grant resume access only to the Job Seeker and the verified employee who claims the request.
- [x] Remove Referrer localStorage fallbacks so candidate context and documents are available only from claimed backend data.
- [x] Reject consumer email domains before adding a verified employee to the hidden company pool.
- [x] Add integration coverage for secure upload, company request creation, single claim, authorized document retrieval, and unrelated-user denial.
- [x] Exercise the production private-referral route wiring with Clerk-compatible middleware-boundary authentication.
- [x] Exercise upload, referral linkage, exclusive claim, and signed document access through the isolated Airtable test ledger and protected route integration coverage; no live application data was used.
- [x] Apply the supplied Clerk test-instance configuration and validate protected private-referral authentication at the middleware boundary.
- [x] Use an isolated Airtable test ledger to verify referral linkage, exclusive claim, and document-access authorization without touching live application data.
- [x] Create a dedicated disposable Airtable base for private-referral authorization verification.
- [x] Defer live Razorpay, PayPal, and Chargebee provider activation; retain the reviewed simulation until the user explicitly reopens live payments.
- [x] Update landing workflow language so it correctly assigns the post-submission hiring-manager email draft to the Job Seeker.
- [x] Present additional documents as an explicitly optional supporting-documents choice after the required resume is attached.
- [x] Design a privacy-preserving viral growth loop that compounds verified employee participation and Job Seeker outcomes without exposing Referrer identities.
- [x] Design a progressive sign-in model and low-friction verified employee hiring and walk-in opportunity sharing flow.
- [x] Move the X+Y+Z hiring-manager email draft from Referrer review to the Job Seeker’s post-referral confirmation experience.
- [x] Replace whole-page Referrer scrolling with independent, bounded review and wallet section scrolling on desktop while preserving mobile flow.
- [x] Create rendered design previews for an anonymized Opportunity Wall, a 20-second employee opportunity post, and a post-request company share card before enabling any of the three features.
- [x] Implement the approved public Opportunity Wall with anonymous company-level opportunity cards and a progressive-sign-in referral handoff.
- [x] Implement the approved verified-employee Hiring Now and Walk-in opportunity post composer with work-email verification at publish.
- [x] Add a concise landing-page entry to the approved public Opportunity Wall.
- [x] Audit the existing viral-growth playbook, live referral funnels, sharing surfaces, and $1 token model against the zero-friction and privacy constraints.
- [x] Implement a post-request, company-specific share loop with copy, WhatsApp, LinkedIn, and email handoffs that never reveals an employee identity.
- [x] Add contextual, truthful opportunity and referral-sharing prompts only after meaningful user success moments, without blocking the core task path.
- [x] Improve monetization clarity and conversion within the existing token balance panels while retaining three free tokens and simulated checkout.
- [x] Add automated coverage for growth-sharing actions and token monetization states, then validate desktop and mobile performance.
- [x] Execute the authorized isolated Airtable referral-lifecycle verification without touching live application data or enabling payment providers.
- [x] Fix the Referrer work-email verification action so a signed-in employee can continue into the private company inbox.
- [x] Fix the Job Seeker resume-upload action so a signed-in user can attach the required resume and continue the private referral request.
- [x] Replace Referrer work-email verification with a secure email-OTP flow that enrolls only verified company-email domains in the private employee pool.
- [x] Fix the Clerk security re-verification handoff required before sending a work-email OTP.
- [x] Show clear signed-in account status and an account action in the active product header.
- [x] Add privacy-safe operational activity logging for key Job Seeker and Referrer workflow events without recording document contents or authentication secrets.
- [x] Build a protected administrator activity-log viewer with searchable diagnostic metadata and role-based access control.
- [x] Promote the explicitly confirmed account that received the protected-route denial to administrator and verify access to the activity log.
- [x] Repair the Clerk-to-application administrator authorization bridge for the explicitly promoted account.
- [x] Make ayodhya@skipwait.me the durable skipwait.me administrator account and preserve that role through Clerk sign-in synchronization.
- [x] Add a visible Clerk sign-out action to the account-status control so users can switch accounts.
- [x] Rename opportunity discovery labels to make clear that the Wall contains privately shared employee-referral opportunities, not public career-page listings.
- [x] Remove the separate saved-device sign-in control and restore supported browser credentials or active sessions automatically without disrupting sign-in fallback.
- [x] Verify the requested Internal openings landing label, align test coverage, and save a checkpoint.
- [x] Add a clear personal and work account switching flow with active-account status, sign-out, and preserved work-email OTP safeguards.
- [x] Rename the remaining employee-shared openings mobile label to Internal Openings and verify consistent discovery terminology.
- [x] Remove sign-in and account controls from the landing header, keeping authentication at protected Job Seeker and Referrer commitment steps.
- [x] Add concise in-flow guidance to switch to a personal email for Job Seeker mode and to a verified work email for Referrer mode.
- [x] Remove visible personal/work email switching labels and the signed-in email address from active flow headers to reduce UI overload.
- [x] Remove the remaining signed-in status, account-switch, and sign-out icons from active Job Seeker and Referrer headers.
- [x] Add a compact user-icon dropdown in active headers and place Sign out inside it without showing account identity.
- [x] Diagnose and fix work-email OTP delivery when a code is routed to the personal sign-in email instead of the entered company email.
- [x] Require Target Role URL to be a valid HTTP or HTTPS web link before continuing or creating a private referral request.
- [x] Add a Settings action above Sign out in the compact user-icon dropdown.
- [x] Diagnose and fix the Add your resume control when it does not open secure sign-in or the authenticated file chooser.
- [x] Complete a comprehensive evidence-based review of global platform growth playbooks and provide prioritised skipwait.me recommendations without implementing changes.
- [x] Remove the separate unsigned sign-in control and make Add your resume open secure sign-in directly.
- [x] Fix Add Tokens header: skipwait.me logo must stay top-left; back button must not sit beside the brand.
- [x] Let Job Seekers select a resume before authentication and trigger secure sign-in only when Send private referral request is clicked.
- [x] Show the signed-in user’s profile picture in the top-right account menu, with an accessible fallback avatar.
- [x] Diagnose and fix attached resume visibility for authorized Referrers while preserving document-access controls.
- [x] Add work-email management in Settings and show Switch to Job Referrer mode only after a verified work email is present.
- [x] Preserve a selected resume through Clerk sign-in so it is not discarded before secure upload and referral submission.

- [x] Recover the Chargebee checkout, webhook, token-ledger, and payment tests lost from the working tree after the accidental rollback to the prior checkpoint.
- [x] Re-run TypeScript, Vitest, and production build checks after payment recovery before continuing webhook validation.
- [x] Re-verify the configured Chargebee webhook and dedicated project secret after payment recovery.
- [x] Save a new checkpoint containing the recovered payment implementation and verified provider configuration.

**Operational history:**
- [x] Audit and preserve the 24 Razorpay legacy subscriptions after user-approved immediate cancellation; all 24 are verified cancelled.
- [x] Create and verify Chargebee USD one-time token catalogue at $1, $5, and $10.
- [x] Configure the Chargebee test webhook at https://skipwait.me/api/chargebee/webhook with the payment-succeeded event.
- [x] Provision the project-side Chargebee webhook secret.
- [x] Recover the payment implementation after the accidental workspace rollback before using the configured webhook for token fulfillment.

- [x] Add automated valid `payment_succeeded` webhook coverage proving wallet crediting and duplicate-event protection without using browser callbacks.
- [x] Validate the complete checkout-intent → verified paid-event → wallet refresh path without inserting test data into the live database.
- [x] Finalize the product decision that Chargebee is the single hosted checkout route for USD billing, with Razorpay and PayPal acting as configured gateway options behind Chargebee rather than separate UI checkout buttons.

- [x] Use the connected Razorpay gateway for the current test checkout flow and defer PayPal routing until a PayPal sandbox account is connected.
- [x] Verify the available Razorpay route for the hosted USD checkout without submitting a payment.
- [x] Document that PayPal is not connected and no international PayPal routing is active.


- [x] Apply the non-destructive migration adding the Chargebee checkout-intent reconciliation identifier and index.
- [x] Include an opaque checkout intent in Chargebee `pass_thru_content` and persist it with the pending hosted-page payment intent.
- [x] Require hosted-page ID plus pass-through checkout intent reconciliation before crediting a verified Chargebee payment event.
- [x] Add regression coverage rejecting mismatched or absent checkout-intent reconciliation and preserving duplicate-event idempotency.
- [x] Verify the published Chargebee one-time-payment capability and the Razorpay-1 Card → USD Smart Routing mapping with a non-payment hosted-checkout smoke test.
- [x] Record that PayPal remains unconnected and deferred; no PayPal or international country-based routing is active.

- [x] Re-audit the active Chargebee one-time token catalogue, hosted-checkout capability, Razorpay Smart Routing, and payment-succeeded webhook against skipwait.me requirements.
- [x] Verify the connected Razorpay test gateway remains the active Card → USD route for the single Chargebee-hosted checkout.
- [x] Re-run non-payment checkout and server-side reconciliation safeguards, then record the final test-provider state.

- [x] Complete the current provider audit through server-side credentials and non-payment API checks without relying on an active Chargebee dashboard browser session.

- [x] Reconfirm Chargebee Razorpay-1 USD routing and the payment-succeeded webhook through the authenticated dashboard and server-side audit.
- [x] Defer the paid Razorpay test payment: no card or OTP was submitted; the hosted checkout and server contract are verified, and payment entry remains user-controlled.
- [x] Verify webhook parsing, matching checkout-intent reconciliation, and exactly-once safeguards through automated tests; live webhook delivery remains deferred until a user-controlled payment.

- [x] Diagnose and correct the Chargebee/Razorpay invalid-request error: USD with India billing was rejected before gateway submission; supported billing routes are now explicit.
- [x] Decide and implement the compliant currency route: INR for India billing through Razorpay Domestic, or USD only for eligible export/international customers after Razorpay International/Export eligibility.

- [x] Replace the unrestricted USD-only experience with a Razorpay-only supported-currency selector: ₹99 INR for India and $1 USD for eligible international/export billing; PayPal remains deferred.
- [x] Create and verify the INR one-time Chargebee token price, then align server-side checkout and fulfillment contracts.

- [x] Define compliant currency-selection rules: India billing uses INR through Razorpay Domestic; USD is offered only for eligible international/export customers.
- [x] Verify the USD Chargebee item price and document Razorpay International/Export as the required eligibility; PayPal remains disabled.
- [x] Implement a server-validated currency selection in the checkout API and UI, rejecting unsupported currency/customer combinations.
- [x] Add INR/USD checkout contract tests and run the full suite and production build.
- [x] Document the invalid-request diagnosis, supported routes, and deferred PayPal path.

- [x] Create a fresh ₹99 INR Chargebee checkout intent and complete one user-approved Razorpay test payment.
- [x] Verify Chargebee webhook delivery, matching pass-through reconciliation, one purchase transaction, and exactly one token credit for each controlled paid event.

- [x] Repeat the controlled ₹99 INR Razorpay test using Chargebee’s Valid Card fixture after the deliberate Verification Error Card response `(3009) Do not honour`.

- [x] Add an optional test-only billing-address prefill to the Chargebee checkout helper so the controlled INR sandbox retry can avoid native dropdown automation limits.
- [x] Adapt webhook processing to Chargebee v2 `payment_succeeded` payloads and retrieve the successful hosted page before reconciling the stored checkout intent.
- [x] Redirect the Chargebee test webhook from the stale production path to the active verified receiver, then resend or retry the paid event.

- [x] Test India billing with the INR Razorpay Domestic route and an India billing address using the valid sandbox card fixture.
- [x] Test India billing with an intentionally mismatched international/USD route and confirm server/provider rejection without token credit.
- [x] Test eligible international billing with the USD Razorpay International/Export route and a non-India billing address using the valid sandbox card fixture; provider returned an invalid-request response and no credit was issued.
- [x] Test international billing with an intentionally mismatched India/INR route and confirm server/provider rejection without token credit.
- [x] Verify Chargebee webhook delivery, hosted-page/pass-through reconciliation, idempotency, and token-credit outcomes for every approved scenario; failed/mismatched scenarios produced no fulfillment.
- [x] Document country/card matrix results and any production gateway or webhook limitations.

- [x] Audit the Razorpay test account’s International/Export eligibility and the Chargebee Razorpay-1 USD Smart Routing state; the route was superseded by the connected PayPal gateway.
- [x] Apply supported test-environment configuration for non-India USD payments without changing live billing by routing USD PayPal Express Checkout to PayPal.
- [x] Re-run the United States/USD hosted checkout using the connected PayPal Sandbox merchant; PayPal rejected the same-merchant payment before authorization.
- [x] Verify the Chargebee event, webhook reconciliation, and one-token credit after an international success, or document the remaining provider-side blocker; the same-merchant PayPal rejection created no successful fulfillment.

- [x] Enable and authorize the existing Razorpay connector for account and test-payment inspection.
- [x] Close the Razorpay International Cards activation path after connector authorization because PayPal is now the selected international USD provider.

- [x] Research evidence-backed early distribution strategies used by globally scaled software companies when they lacked an audience.
- [x] Translate the applicable mechanisms into a prioritised, low-friction distribution playbook for skipwait.me with metrics and safety guardrails.

- [x] Confirm the prior Razorpay International Cards path was not used for the final USD routing; Chargebee Smart Routing now uses PayPal Express Checkout for USD.
- [x] Create and submit a fresh controlled USD sandbox checkout after the PayPal connection; the hosted page reached PayPal, but the merchant-account self-payment restriction prevented success.
- [x] Validate the configured Chargebee API credential against the test-site events endpoint with a lightweight Vitest check.

- [x] Obtain or create a separate PayPal Sandbox Personal buyer account; the connected Business merchant cannot pay itself, and the PayPal Developer Dashboard is currently Cloudflare-blocked.

- [x] Defer the controlled $1 USD PayPal checkout with the separate Personal buyer and exactly-one-token reconciliation until the user reopens payment work.

- [x] Defer the Sandbox Personal-buyer sign-in and approved $1 USD PayPal checkout until the user reopens payment work.

- [x] Diagnose and correct the Chargebee Test PayPal merchant mapping after the controlled checkout returned PAYEE_ACCOUNT_INVALID before collecting payment.

- [x] Complete or explicitly defer the PayPal Sandbox Business merchant KYC requirement triggered during Chargebee PayPal reconnection; it requires business, personal, bank, and document verification outside the application.

- [x] Confirm that the newly reauthorized US Sandbox Business merchant resolves the prior PAYEE_ACCOUNT_INVALID condition before completing the Personal-buyer USD test.

- [x] Defer recovery of a sandbox-capable browser session for the final PayPal button authorization until the user reopens payment work.

- [x] Defer the supported recovery for the inaccessible embedded PayPal button until the user reopens payment work; no fulfillment event is fabricated.

- [x] Reconcile and correct all safe Chargebee Test, Razorpay Test, and PayPal Sandbox configuration mismatches for India/INR and global/USD checkout paths.

- [x] Assess Chargebee Payment Components for compatibility with the existing one-time token checkout, PayPal USD routing, and verified webhook-only token fulfillment before replacing the hosted checkout handoff; it would still use a cross-origin payment iframe and require a separate payment-intent plus order-creation architecture, so it does not resolve the current automation limitation.

- [x] Audit current Razorpay, PayPal, Chargebee, Smart Routing, webhook, and fulfillment configuration; classify each item as verified, provider-blocked, or pending production deployment.

- [x] Re-run the final route matrix: India/INR through Razorpay, global/USD through PayPal, and country/currency mismatch rejections without token credit.

- [x] Inspect current payment records and fulfillment safeguards after the route matrix, confirming no duplicate or browser-return token credits.
- [x] Investigate payment-fulfillment rows labelled `pending:` and ensure no pending hosted checkout can ever create a token credit.
- [x] Make the live Chargebee credential smoke test resilient to normal provider response latency so the full regression suite remains reliable.
- [x] Audit the Job Seeker, Referrer, and Admin journeys from landing through return use; identify ethical psychological hooks, retention mechanics, and low-friction network-invitation loops before implementing changes.
- [x] Refocus the active skipwait.me experience around one singular promise: the fastest trusted way to ask for or give a job referral, with all secondary features serving that core action.
- [x] Define shared referral-status vocabulary, flow-health metrics, and privacy boundaries for the focused referral operating system.
- [x] Build a Job Seeker My Requests home with factual status timelines and a clear next action.
- [x] Build a Referrer My Company Inbox with new, saved-for-later, and completed private requests.
- [x] Build an aggregate Admin Flow Health dashboard that surfaces funnel friction and company-coverage gaps without exposing private content or employee identities.
- [x] Add regression coverage and visual verification for the new Job Seeker, Referrer, and Admin referral operating-system flows.
- [x] Let users choose and purchase multiple referral tokens in a single low-friction checkout while preserving exact server-side token fulfillment.
- [x] Add a protected, reasoned, and auditable Admin recovery workflow for legitimate token-credit issues without bypassing the verified payment record.
- [x] Add one-click $5 and $10 token options alongside the existing custom quantity selector, preserving currency-aware checkout and verified fulfillment.
- [x] Replace password-based secure employee sign-in with same-email OTP and magic-link entry while retaining verified-work-email and private-referral protections.
- [x] Replace the generic Referrer sign-in modal with a custom company-email-only OTP-or-magic-link flow that rejects personal domains while preserving Job Seeker sign-in.
- [x] Pause the live landing-to-onboarding design review after presenting the landing page; resume the onboarding review when the user requests it.
- [x] Remove the Referrer OTP-versus-magic-link choice so valid company emails receive an OTP immediately and continue directly to code entry.
- [x] Refactor active skipwait.me flows into mobile-first fixed-viewport guided screens with one clear forward action and no long-page scrolling.
- [x] Route the signed-out My Company Inbox employee entry through the custom work-email-only OTP flow instead of a generic sign-in modal.
- [x] Route signed-out employee opportunity posting through the company-email-only OTP enrollment before allowing publish.
- [x] Remove or contain the non-operational scrolling request-share preview route so it cannot present as an active user flow.
- [x] Remove legacy Bridge wording from the Not Found recovery screen.
- [x] Show clear included-credit progress after a successful referral request and provide an optional low-pressure 1/5/10 credit top-up entry.
- [x] Define and implement a transparent free plan with three referral-request credits per monthly cycle, optional 1/5/10 credit packs, and Pro/Max subscription entitlements.
- [x] Design request continuation and post-exhaustion upgrade moments so payment choices appear only when they are useful and never obscure the primary referral task.
- [x] Implement the approved Pro plan at 10 monthly requests for ₹599/$7 and Max plan at 30 monthly requests for ₹1,299/$15, with cancellation and verified server-side entitlement handling.
- [x] Preserve non-expiring one-time 1/5/10 credit packs alongside monthly plan allowances and reset only monthly entitlements at the correct cycle boundary.
- [x] Enable Chargebee subscription lifecycle events on the existing Test webhook while preserving verified payment-success delivery.
- [x] Detect the likely India or international payment route from privacy-minimized locale and network signals, show one local amount by default, and preserve a quiet correction path when detection is wrong.
- [x] Remove manual INR/USD choices from credit-pack and Pro/Max checkout surfaces while retaining server-side route validation and accessible payment disclosure.
- [x] Recommend a user-centered Referrer pricing policy and contextual upgrade guardrails that preserve zero-friction referral participation.
- [x] Show eligible local PPP pricing with an honest reference price, visible discount percentage, and a frictionless billing-country correction path.
- [x] Update Pro to $10 globally and ₹599 in India, and Max to $20 globally and ₹1,299 in India, with verified Chargebee catalog consistency.
- [x] Audit and prioritize low-friction, user-benefiting micro-tweaks for trusted sharing, word of mouth, and paid continuation without compromising Referrer privacy or core referral flow.
- [x] Audit and harden the verified payment-to-credit path against delayed webhooks, duplicate events, mismatched checkout state, provider outages, and user-return recovery without browser-side crediting.
- [x] Infer the actual employer from LinkedIn, Indeed, Glassdoor, ATS, and other hosted job links so private referral requests notify only matching verified company employees.
- [x] Enforce and regression-test that only verified Referrer profiles whose work-email domain exactly matches the resolved employer receive or can view a private referral request.
- [x] Keep an uncovered-company referral request private without spending a credit, then surface one voluntary, privacy-safe company-coverage invitation that converts a real employee into verified supply.
- [x] Reward both the trusted inviter and the newly verified matching employee only after a private company-coverage invitation converts, with durable attribution, one-time fulfillment, and no reward for spam or self-invites.
