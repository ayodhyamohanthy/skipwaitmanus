# UI-referrer-privacy-copy-tests: prepare complete regression source

## 1. Goal

Prepare the complete executable red-first test source for the future Tier 1
referrer privacy-copy repair. This preparation changes no product behavior.
The runtime packet `UI-referrer-privacy-copy.md` remains NOTREADY and
unregistered until these tests and their actual assertion-level RED evidence
exist and receive review. The runtime row is deferred, not dependency-blocked
while pretending its packet is ready.

## 2. Existing contract and evidence

The released dc6492 sign-in promises "See the role, resume, and forwardable
note before you choose." All three twins contain it. Current privacy controls
hide the name and resume before acceptance. File access after acceptance also
requires active document access; acceptance alone does not guarantee permanent
or unconditional access. The existing packet records this copy contradiction,
not a demonstrated data leak. Read the current three components and applicable
privacy/login tests before preparing the regression.

## 3. Tier and phase

Tier 3, narrowly docs/test-source preparation under DELEGATION section 3.
No collected test, product change or config change belongs in this task.
The independent phase assessment was COMPLIANT WITH CONDITIONS, not a candidate
PASS. Original PR1109/952d FINDINGS stand: the Tier 1 packet did not meet the
already-written-tests precondition. This phase does not waive that precondition.
Before claiming, the exact prep-task author route must receive separate review
and normal admission to main. Use the ordinary real BUILD claim, not an external
architect/packet claim. No runtime route or Messages claim/receipt qualifies it.

## 4. Ownership and staffing

Branch: `agent/queue/ui-referrer-privacy-copy-tests`.
Do not edit the three components, their existing tests, or REL's fetch switches.
Preserve all held and unpublished work. Any unexpected overlap is coordinated
through Instinct, not silently taken over. The coordinator/packet writer retains the CEO/architect responsibility for
Tier 1 red-first preparation under DELEGATION section 1 and the D-225
intelligence/development split. The qualified external GLM author produces
the bounded test-source artifact as the development tool; it does not claim
to be the CEO or packet writer. The packet writer must inspect, verify and
integrate the complete byte-identical source into runtime section 7 before
READY registration. This division is explicit preparation responsibility,
not a waiver of section 1 or concealment of the actual code author. Its
adequacy requires independent exact-carrier assessment.
The actual test author is a contributor
to the later runtime test source and must be excluded from its independent
Tier 1 review even though the picker does not automatically connect tasks.
Proposed prep author: visible GLM 5.3, conservative canonical family key
`glm-5.3`, grouping observed GLM 5.3/Flash aliases. Actual operator:
`Instinct · public-model-review-nov10`; proposed build/fix route:
`referrer-copy-tests-author-macaly-glm-nov10`. Selection observation digest:
`a97e2f6906f008332d139d0b8aef545149a6c59ec55aa584d3c9ab017296e55c`.
Provider https://www.macaly.com/ ; actual qualification discussion:
https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1109 . The proposed route
is not trusted until independent exact review and normal main admission.
Actual new-task composer selection/override must be checked before the prompt.

Intended later runtime builder: Mistral Large 4 under the existing conservative
Mistral-family key. Intended final Tier 1 reviewer: DeepSeek V4.1 Flash under
the existing DeepSeek key. Their runtime routes are NOT admitted here. GLM's
prior docs-only review is not code participation, but once it authors tests it
cannot independently review the runtime. A separate actual external reviewer
must assess the prep execution carrier; no self-admission.

Macaly's terms https://www.macaly.com/terms-of-service sections 3.10/3.12
permit commercial generated-content use subject to restrictions. Sections
3.11/8.3 permit supplier use and Free-content public exposure. Submit only
owner-authorized public project source and sanitized requirements, never
private context/account data/secrets. Pricing
https://www.macaly.com/docs/en/welcome/pricing describes Free allowance and
paid top-ups. Free 3.3M was observed at 08:42, not a future capacity guarantee.
Recheck before prompting; stop at limits, never upgrade or add billing.

## 5. Exact scope and output form

- @docs/plans/tests/referrerPrivacyCopy.test.tsx.source: NEW complete UTF-8
  executable TSX test source, not a patch, snippet, pseudocode or placeholder.
- @docs/plans/UI-referrer-privacy-copy.md: only align numbered handoff sections
  and insert the complete unchanged test body in section 7, with attribution,
  source digest and exact scratch RED proof. Do not invent a receipt ID or mark
  runtime ready before the real evidence is admitted.
- @docs/plans/UI-referrer-privacy-copy-tests.md: Status/evidence sections only.

Ownership: the row owns the inert source and the future runtime packet
explicitly. This prep packet's own Status edits are permitted by the existing
scope-check packet exception. These are exact docs paths, not authority to
edit product paths or broad docs. The packet writer integrates the returned
source into the runtime packet under this explicit scope and retains actual
GLM authorship; it does not relabel itself as test author.

The final collected path is fixed NOW:
`client/src/components/referrerPrivacyCopy.test.tsx`.
The source must begin with `// @vitest-environment jsdom`, as existing
`client/src/pages/goal/messages/messagesSignInButton.test.tsx:1` does. Current
`vitest.config.ts` defaults to node; the per-file directive enables actual
React render assertions without any config change. Missing-environment or
import/setup errors cannot count as target RED. Imports in the inert source
must work unchanged at that exact path. The source
must not be executable merely from its inert location; run it only through the
scratch transport below. No dependency, configuration, glob, skip, xfail or
expected-failure wrapper is allowed. Do not create a separate source directory
or alter an existing test. No legal/money/auth-policy/product/flag change.

## 6. Preparation steps

1. Start from current main plus the legitimate ordinary qualified prep BUILD
   claim. Inspect current files and existing tests. Capture public exact input,
   actual selected prep model, raw output and applied bytes.
2. The actual qualified external prep author writes every test-source byte.
   An operator semantic edit is not transport and must be reported/qualified.
3. In an isolated clean worktree record `git status --short`. Copy the complete
   source bytes, without rewriting imports or assertions, to the temporary
   UNTRACKED final collected path. Do not overwrite an existing tracked or
   dirty path. Record SHA-256 equality between source and temporary file.
4. Run `pnpm vitest run client/src/components/referrerPrivacyCopy.test.tsx`
   against unchanged current-main product source. Retain exact command,
   exit status, assertion-level failing output and component cases. A setup,
   compilation, import or network failure is not valid RED evidence.
5. Remove only the temporary file that this isolated task created. Record
   `git status --short` and a diff confirming NO collected test, product,
   existing test or config change remains. Never remove someone else's work.
6. Publish only the scoped inert source and docs with its actual build
   contribution, claim and evidence. Independently admit its exact execution
   receipt under MODEL_PROVENANCE before any completion marker. No receipt
   or successful execution is asserted in advance by this packet.

## 7. Required assertions and RED acceptance

This Tier 3 packet provides acceptance criteria for source preparation, not
already-authored test bodies and not an exception to Tier 1's requirement.
The later runtime packet must contain the complete actual source before READY.

The prepared regression must render actual ReferrerOtpSignIn, noncompact
WorkEmailSignIn and GoalOtpSignIn paths. Do not replace those target components
with mocks. It must fail on the current misleading pre-choice resume promise
in all three paths, and require an explicit truthful privacy boundary: name
and resume hidden before acceptance, post-acceptance file access conditional
on active access. Avoid requiring a claim that every accepted referral always
has an available document. Absence of the old sentence alone is insufficient.
Do not send OTP/email or mutate accounts. Existing login/privacy controls and
tests remain unchanged. Retain each real failure; do not treat an import error
or missing setup as the target failure. No runtime fix is allowed in this prep.

## 8. Verification and independent assessment

Run git diff --check, validateAssignments and the applicable focused docs,
provenance and queue suites. Required CI must be green on the exact candidate
that lands; the active suite stays green because no failing collected test is
landed, not because a check is skipped. Supply actual scratch RED assertions,
source/hash equality, clean-path evidence and all contribution provenance to
an independent reviewer. The reviewer assesses the exact prep scope/tier and
full contract, not just a static string or a fabricated receipt. Use normal
protected landing and current-main checks; no admin bypass or self-review.
The packet writer does not land its own registration carrier.

## 9. Later runtime transport and source retention

After accepted prep completion, the later Tier 1 registration must pin the
actual prep route, execution ID, ordinary claim SHA, source SHA-256 and exact
applied patch digest. The future runtime observation must explicitly attribute
the transported collected test bytes to that prep author and prove byte
identity with the inert source. No rebranding of test authorship, import edits,
semantic rewrites or concealed second author. Any required test correction is
a new attributed contribution and needs review, not invisible transport.
Retain the inert source as the immutable packet source of record after runtime
landing, identified by digest; the collected copy must remain byte-identical
at that handoff. Later intentional test evolution must name the new version
and retain this historical source, never silently maintain two divergent
claims of the same version. The independent Tier 1 reviewer checks prep-author
exclusion manually across tasks. Runtime routes must be separately admitted
for the runtime task before its claim; this prep receipt is not runtime BUILD.

## 10. Status and non-claims

Preparation registration candidate only. No external task prompt, test source,
RED run, execution receipt, qualified route, runtime admission, data disclosure,
provider acceptance, deployment or product completion is asserted here.
The proposed third-model task-specific route and exact independent carrier
assessment remain pending before ordinary prep BUILD.

## Source execution candidate and separate prose handoff

Actual claim1857d9a6 -> sourceaf0ed257 generated one immutable inert source
file only. Proposed receipt referrer-copy-tests-glm-build-nov10 covers that
exact source-only range. Its semanticEdits:false does not cover coordinator-
authored packet prose or this Status/evidence addition. The packet writer
mechanically integrated the exact14737byte source into runtime section7 with
actual RED9fail/4pass/exit1 and cleanup evidence. No prep completion, runtime
READY, independently admitted execution or deployment is asserted. Source
detector/active-access strength concerns remain open for actual independent
review; fixes require real external-author contribution, not hidden edits.

Future runtime registration must explicitly transfer ownership of its packet
from this prep row. Source bytes and actual prep contributor remain pinned;
GLM is excluded from final independent Tier1 runtime review across tasks.

### Actual external revision candidate, not accepted

DeepSeek's actual af0ed/f61ed source assessment returned B1/B2/B3 FINDINGS.
GLM, not the operator, revised the source at7ef155f5 afteraf0ed. One cumulative
1857 claim to7ef BUILD candidate replaces the unadmitted prior candidate,
retaining both versions, actual multi-turn inputs/outputs and original findings.
Revised source is23937bytes SHAb125aefa50843ab6b38ba4352b91a5cb07c4b81888d02f813a2c5d96bd02c54f.
Actual revised RED:25tests9assertionFAIL16PASS, exit1; cleanup clean. This is
not independent quality acceptance. Broad future qualifiers and expired-access
polarity remain explicit adversarial review questions. Coordinator's §7/proof
update remains separate prose outside the source-only GLM execution range.
