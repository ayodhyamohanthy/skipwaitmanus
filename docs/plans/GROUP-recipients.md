# GROUP-recipients: a group buyer pastes a list of candidate emails and sees exactly which ones count, before any price or payment

Tier 2 · lane `group-recipients` · branch `agent/queue/group-recipients` · epic GROUP · no dependencies

## Why

The founder's Group Plan direction (Oct 31, `docs/plans/GROUP-bulk-oct31.md`, sources there) starts with "candidate email
addresses in the easiest format". Product contract item 1 of that packet: accept easy list input, validate, normalize and
deduplicate, and preview invalid and duplicate rows **before checkout**, so a buyer is never charged for a dropped
recipient. This row builds only that contract, as a pure shared module the later quote, intent and UI rows consume.
It moves the goal by letting one buyer (a college, a bootcamp, a team) put many candidates on SkipWait in one step.

## Binding rules (quoted)

- "Validate, normalize and deduplicate; preview invalid/duplicate rows before checkout; never silently charge for dropped
  recipients. Existing-account lookup must not expose account existence or private data to an institute."
  (`GROUP-bulk-oct31.md`, Product contract 1)
- Public wording says "Group Plan", never "Institute" (owner, Oct 31 11:58, same packet).
- AGENTS.md §3: Zod at the boundary, no `any`/`unknown` shortcuts, shared contracts in `shared/`.

## The build (one new module, no I/O)

`shared/groupPlanRecipients.ts`:

1. `GROUP_RECIPIENT_LIMIT = 500` (a stated, changeable assumption: the largest list one purchase accepts; the quote row may
   change it).
2. `parseRecipientList(text: string): RecipientListResult`, pure and deterministic:
   - Split on newlines, commas, semicolons and tabs, so a paste from a sheet, a CSV column or an email client works.
   - Per entry: trim; strip one pair of surrounding quotes; accept the `Name <address>` form by taking the address; skip
     empty entries (they are not errors).
   - Normalize the address to lower case and validate it with zod's email check. An address over 254 characters is
     invalid (`too_long`); anything else that fails is `not_an_email`.
   - Keep the first occurrence of each normalized address in input order; every later one is a duplicate that names
     the entry number of the first.
   - When more than `GROUP_RECIPIENT_LIMIT` valid addresses remain, return all of them and set `overLimit: true`;
     never truncate silently (the caller refuses to quote).
3. `RecipientListResult` (zod schema plus inferred type, readonly):
   `{ valid: string[]; invalid: { entry: number; value: string; reason: "not_an_email" | "too_long" }[];
   duplicates: { entry: number; value: string; firstEntry: number }[]; overLimit: boolean; entries: number }`.
   `entry` is the 1-based position among non-empty entries. `value` in `invalid` is the trimmed input cut to 120
   characters, so a pasted paragraph never bloats the result.

Out of scope (later GROUP rows): prices, the 10% discount, seats, checkout intents, payment, activation email,
delegation, any route, any UI, any database read. The module must not look up accounts: whether an address already has
an account is never part of this result.

## Files

`owns`: `shared/groupPlanRecipients.ts`, `shared/groupPlanRecipients.test.ts`, `docs/plans/GROUP-recipients.md`.
Nothing else, no dependency added.

## Tests (red first: the module does not exist, so the suite fails to resolve it)

Newline, comma, semicolon, tab and mixed separators; `"Name" <a@b.co>` and quoted addresses; upper-case input folds into
one address and the second is a duplicate naming the first's entry; blank lines and trailing separators are not errors;
`not_an_email` and `too_long` with their entry numbers; a 121-character junk entry is cut to 120; exactly 500 valid is
not over the limit and 501 is, with all 501 returned; input order preserved; the result parses with its own zod schema;
the result has no key that could carry account state.

## Definition of done

Focused tests and `pnpm check` green; required CI green; the row's Status line below says `done — <sha>`.

## Stop and ask

Anything that touches price, discount, seats, payment, identity linking or email sending belongs to the next GROUP rows,
not here: report it instead of building it.

## Status

- GROUP-recipients: done — `ed03bb166` — GPT-6.1 Sol · ddfb — 2026-11-25 — [PR #1606](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1606).
- Read receipt: claimed at `430b1e118`, based on current main `753c1374f`; read `docs/BRIEF.md`, `AGENTS.md`,
  `docs/PRD.md`, `docs/BUILD_CONTINUITY.md`, `COLLABORATION.md`, this packet and its parent packet; decisions checked
  through D-399, including D-394–D-398 and the original October 31 Group Plan direction. No prior implementation or PR
  exists for this row; registration is `f367011b0` / PR #1601. No scope or decision conflict found.
- Plan: export `GROUP_RECIPIENT_LIMIT`, `recipientListResultSchema`, inferred readonly `RecipientListResult` and
  `parseRecipientList(text: string): RecipientListResult` from `shared/groupPlanRecipients.ts`. Add the packet's red-first
  cases in `shared/groupPlanRecipients.test.ts`; record completion in this packet and `docs/plans/assignments.json`.
  The 500-address limit remains changeable; overflow returns every valid address. No I/O or runtime integration.
- Checkpoint: the new suite first failed to resolve the absent module (2026-11-25, 05:50 UTC); after implementation,
  `pnpm vitest run shared/groupPlanRecipients.test.ts` passed 23/23 and `pnpm check` passed (05:52 UTC).
  Duplicate diagnostics carry the normalized address; invalid diagnostics retain the original trimmed input, capped
  at 120 characters. Results, arrays and diagnostic objects are readonly and frozen.
- Validation on `d10bf800a` (main `47e8f6645` integrated): typecheck, production build, scope check, design-token
  audit, migration lint and deployment-trigger coverage passed. Full local Vitest: 850 files / 9,352 tests passed,
  5 files / 19 tests skipped, one existing Git-history fixture timed out at its unchanged 20-second limit
  (`scripts/classifyCiChange.test.ts`, 400-commit marker case). That exact test passed unchanged in isolation
  (12.96 seconds, 2026-11-25 06:17 UTC); no assertion, timeout or test configuration was changed.
- [GitHub CI 45557322454](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/45557322454) passed all three
  unit-test shards, their aggregate, typecheck, production build and e2e journeys on `d10bf800a`.
  Main `30d2f6ebe` was subsequently integrated without conflicts or changes to either parser file; D-400 was read
  and leaves this contract unaffected. The final docs/registry revision still lands only after its required CI.
- Delivery scope: pure shared contract only. No route, UI, account lookup, payment, email, configuration or migration
  changed; no live Group Plan flow is claimed. The later GROUP rows own runtime integration and its acceptance.
