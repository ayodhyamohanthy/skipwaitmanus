# DEV-prettier-396

Existing Dependabot PR #8 requests Prettier 3.6.2 to 3.9.6. Its old lockfile
also changes unrelated browser data. This isolated current-main qualification
keeps that branch and PR untouched and carries only the requested formatter.
This is free developer maintenance, not customer UI progress or a security fix.

## Exact scope

- `package.json`: only devDependencies.prettier, pinned exactly `3.9.6`.
- `pnpm-lock.yaml`: only the matching importer version/specifier, package
  resolution/integrity and empty snapshot. No other dependency, lock metadata,
  override or production package changes.
- Own packet Status only if needed. No source, config or formatting changes.

No unfinished registered task owns package.json or pnpm-lock.yaml in the
bounded current-main graph check. That does not establish unpublished state.
Preserve all other branches and coordinate any newly observed conflicting work.
No new dependency, paid plan, account setting or permission is introduced.

## Acceptance

1. Actual downloaded Prettier reports 3.9.6. Execute TS/TSX/JSON/YAML/Markdown
   parsing and format-idempotency checks in memory, without writing source.
   Package JSON format check passes. Do not run repo-wide format --write.
2. Frozen lock installation agrees with exactly that version. Diff review
   proves only the requested formatter package entries changed. Existing peer
   warnings are reported, not silently widened into fixes.
3. Applicable current-main tests/typecheck/build and exact required CI pass.
   Tool version tests do not replace full required CI. No source changes should
   be needed merely to accept this update.
4. Separate review of the final version passes and current main is green.
   Normal protected merge, no admin bypass or code owner-only exception.
5. Verify merged dependency/lock bytes and relevant deployment/CI outcome.
   Do not claim a customer-visible feature or changed production behavior.

Status: registration only; local formatter/build proof exists separately, not
an implementation, independent verdict, required-CI pass or shipping claim.
