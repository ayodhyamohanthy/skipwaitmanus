# UI-referrer-privacy-copy: truthful resume visibility before acceptance

## 1. Evidence and purpose

The released `dc6492b337dcdec0696848fad93101606e3cc1d7` sign-in page at
`https://skipwait.me/sign-in?intent=referrer&returnTo=%2Freferrer-setup`
shows "See the role, resume, and forwardable note before you choose."
The statement was inspected in actual 1280 and 390 browser pixels on November
10, 2026. `SignIn.tsx` imports `ReferrerOtpSignIn`; the same statement also
occurs in `WorkEmailSignIn` and `GoalOtpSignIn`.

This contradicts the existing acceptance boundary in `docs/BRIEF.md` and
D-019(e): the seeker name and resume are hidden until the referrer accepts.
The observation proves a misleading promise, not an actual data disclosure.
Correct this existing-flow copy without changing the privacy or login rule.
This is bounded repair under the existing page-by-page audit and fix scope,
not a new product-policy decision or a priority override.

## 2. Tier and ownership

Tier 1 conservatively: the text explains a privacy boundary on sign-in.
Use branch `agent/queue/ui-referrer-privacy-copy` after ordinary assignment.
The registration appends one task without moving or changing existing tasks.

`REL-client-capture` retains its switch-only ownership of the two component
files. Its fetch/API switches, claims and unpublished work must be preserved.
`DEVICE-SIGNIN-passkeys` retains the sign-in page and seeker component;
`D-048-p3-signin` retains its page-switch and goal-sign-in paths. Do not edit
those paths or make their blocked redesign a prerequisite for this copy fix.
The goal/referrer implementation rows are done on the inspected main.

Because the registry's file-level overlap cannot express the copy-only split
from REL's switch-only ownership, this row declares no `owns`. This is not
permission to bypass ownership: exact hunk review and current shared-record
coordination are required before implementation and integration. If the
actual held or unpublished work overlaps these copy hunks, pause the affected
hunk and obtain a split or handoff through Instinct. Silence is not agreement.
A skipped automatic scope check is not a pass.

## 3. Exact implementation scope

- @client/src/components/ReferrerOtpSignIn.tsx: only the introductory privacy
  promise paragraph, preserving its elements and styling.
- @client/src/components/WorkEmailSignIn.tsx: the same paragraph only, keeping
  compact/noncompact behavior and all handlers unchanged.
- @client/src/pages/goal/referrer/GoalOtpSignIn.tsx: the same paragraph only,
  keeping goal tokens and structure unchanged.
- @client/src/components/referrerPrivacyCopy.test.tsx: NEW focused deterministic
  regression. The qualified author writes the test and every product byte.
- This packet's Status section: evidence and outcome only.

Explain accurately that the role and note can be reviewed before choosing,
while the seeker name and resume must remain hidden before acceptance. Resume
access also requires active document access after acceptance; acceptance alone
is not a promise of permanent or unconditional file availability. Do not
promise a forwardable packet before the server actually supplies it. Ground
any such detail against the current referral card before adopting the words.
Keep existing decline/context and nothing-sent-from-your-account statements
unless current source proves they are misleading, in which case report the
specific conflict and expand scope through review before changing them.

No authentication handler, endpoint, return path, OTP validation, email send,
fetch wrapper, remembered-email behavior, session, access predicate or data
projection change. No shared auth/page import, feature flag, environment key,
dependency, migration, schema, legal text, money copy or pricing change. No
layout redesign or unrelated wording cleanup. No real email, customer account,
payment, provider settings or feature activation during QA.

## 4. Acceptance and verification

1. Read current source and tests, preserve current-main contributions and
   current owners. Write a deterministic regression first. It must fail on
   the actual existing misleading promise in all three render paths, then
   pass for the accurate acceptance boundary. An absent sentence alone is
   insufficient: require an explicit post-acceptance name/resume statement.
2. Exercise noncompact WorkEmailSignIn, ReferrerOtpSignIn and GoalOtpSignIn
   without network sends. Preserve their different rendering and existing
   work-email-only controls. Do not mask the regression by replacing the
   target components with mocks. Existing login/privacy tests stay unchanged
   unless an exact obsolete copy expectation needs an explained replacement.
3. Run affected sign-in/referrer/login/privacy tests, `pnpm check`, design token
   and deploy-contract checks, full Vitest and production build as applicable
   under the current quality gate. Record exact output, including failures.
4. Inspect actual production-bundle pixels at 1280 and 390, source identity,
   readability, wrapping, no horizontal overflow and unchanged actions. Local
   synthetic evidence is not real provider or all-role acceptance.
5. Obtain independent exact-final-version Tier 1 review by an actual model that
   neither built nor fixed the runtime/test contribution. Preserve every
   contributor; no fabricated identity, cosmetic rewrite or history wash.
   Current main composition, exact required CI and ordinary protected landing
   are required. No admin bypass or code owner-only exception.
6. After authorized normal landing, monitor deployment, verify the live web
   SHA and recheck the real released paragraph at both widths. Do not report
   all logins or data privacy end-to-end verified from this copy-only check.

## 5. Provenance and publication boundaries

This carrier contains requirements, registration and two prospective routes,
not product/test implementation, successful external execution or a receipt.
Both routes use actual operator `Instinct · public-model-review-nov10` and
provider `https://www.macaly.com/`:

- `referrer-copy-author-macaly-mistral-nov10`: build/fix; selected public name
  `Mistral Large 4`; conservative existing canonical exclusion key
  `mistralai/mistral-large-4-1t-a52b`.
- `referrer-copy-review-macaly-deepseek-nov10`: review/land; selected public name
  `DeepSeek V4.1 Flash`; existing canonical key `deepseek-v4.1-flash`.

The retained fresh observation digest is
`865c92da023af221fa10bc77d04c537e2c421c3d6b586201d12049c0d2623ab9`.
The earlier shorthand keys were withdrawn; these keys preserve known-family
exclusions, not evidence of a hidden checkpoint, endpoint or cryptographic
provider authorship. Fresh observed homepage selections and Free allowance
(3.3M at the observed check) are prospective, not actual task execution.
The qualification discussion is this actual carrier:
https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1109 . Neither a link nor
a candidate record supplies a PASS. Independent exact-record review and
normal admission on main must precede any runtime claim or execution.

Before the actual task prompt, re-select and inspect the intended model in the
actual new task composer, including any project override; retain that evidence
with exact public input/output and applied bytes. The future operator must
confirm current free capacity and service rights before runtime execution.
[Macaly terms](https://www.macaly.com/terms-of-service) sections 3.10 and 3.12
permit commercial generated-code use subject to their restrictions; sections
3.11 and 8.3 permit service use and Free-content public exposure. Only owner-
authorized public project source and sanitized requirements may be submitted,
never private context, account data, secrets or unreleased confidential work.
[Pricing](https://www.macaly.com/docs/en/welcome/pricing) makes top-ups paid:
stop at the free limit, never upgrade or add billing. A free allowance is not
proof of model identity, productive execution or production acceptance. Messages routes, claims and receipts are task-specific and cannot
be reused as qualification for this task. No spending, paid upgrade or public
submission of private information is approved. Preserve full actual input,
output and selection evidence; use separately reviewed receipt admission
under the current provenance contract before supported completion markers.

The carrier itself requires separate exact delta review, focused tests,
required green CI and ordinary non-packet-writer landing. A candidate is not
trusted on main and this packet does not qualify itself. Packet authorship is
not runtime authorship, and the packet writer does not land its own carrier.

## Status

Registration candidate, November 10, 2026, based on main
`dc6492b337dcdec0696848fad93101606e3cc1d7`. No runtime claim, implementation,
admitted route, review verdict, deployment or completion is asserted.
The two proposed registry records remain candidates pending independent review
and normal non-writer admission.
