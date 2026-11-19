# Packet FND-3: tests throw production-shaped duplicate-key errors, and two duplicate checks stop missing in production

> Read `docs/BRIEF.md` first, then this packet.

| Field | Value |
|---|---|
| Queue row | §3b `FND-3` |
| Decisions | D-019 (basics), AGENTS.md "Fix the root generator" |
| Risk tier | 2 |
| Size | S |
| Implementer | any model |
| Branch | `agent/<model>/fnd3-dup-keys` |
| Depends on | P0-allocated-ask-stuck live (its tests use the same kit) |
| Verified against | `main` `e6b87f8` |

## 1. Goal
In production, Drizzle 0.45 wraps driver errors in `DrizzleQueryError` and puts the MySQL code (`ER_DUP_ENTRY`, errno 1062) on `.cause`. The in-memory test kit throws a bare error with `code` on top. So a check that reads only `error.code` passes in tests and misses in production: a duplicate becomes a generic 500 instead of the intended idempotent answer. `server/creditLedger.ts` already has the right helper (its `isDuplicateKey` walks `.cause`).

## 2. Current behaviour (verified)
1. `server/inMemoryDrizzle.testkit.ts` `insert` throws `Object.assign(new Error(...), { code: "ER_DUP_ENTRY", errno: 1062 })` on a unique collision. `server/ledgerFixtureDb.ts` already throws a real `DrizzleQueryError` wrapping it.
2. These top-level-only checks exist:
   - `server/blocksRoutes.ts`: its duplicate check near the top of the file, used when creating a block;
   - `server/companyDirectoryAdmin.ts`: its duplicate check, used in two admin writes.

## 3. Target behaviour
1. **One helper.** Export a single `isDuplicateKeyError(error: unknown): boolean` from `server/creditLedger.ts`, or move it to a new `server/dbErrors.ts` and re-export it from `creditLedger.ts`. It walks `.cause` up to 5 levels and matches `code === "ER_DUP_ENTRY"` or `errno === 1062`.
2. **Callers.** `server/blocksRoutes.ts` and `server/companyDirectoryAdmin.ts` use it. Behaviour on a duplicate is unchanged from what each file intends (read the surrounding code).
3. **Test kit.** `server/inMemoryDrizzle.testkit.ts` throws the production shape: `new DrizzleQueryError(query, params, cause)` with the coded error as `cause`. Import `DrizzleQueryError` from `drizzle-orm`; check `node_modules/drizzle-orm/errors.js` for the constructor.
4. **Audit.** Run `/usr/bin/grep -rn "ER_DUP_ENTRY\|1062\|\.code ===" server --include=*.ts | grep -v test`. Every remaining top-level-only duplicate check either uses the helper or gets a one-line comment saying why it reads a raw driver error (for example, the code runs on the `mysql2` connection directly).

## 4. Tests first
- `server/blocksRoutes.test.ts`: "a duplicate block is answered as its intended idempotent result when the driver error is wrapped". It is red on today's code once the kit throws the wrapped shape.
- The same for one `companyDirectoryAdmin` write.
- A unit test of `isDuplicateKeyError` covering bare, wrapped, doubly wrapped and non-duplicate errors.
- Every existing test that catches the kit's duplicate error must still pass. If one checked `.code` on the caught error, update it to use the helper, never weaken it.

## 5. Files
`server/creditLedger.ts` (or new `server/dbErrors.ts`), `server/blocksRoutes.ts`, `server/companyDirectoryAdmin.ts`, `server/inMemoryDrizzle.testkit.ts`, their tests, the §3b row, and `docs/ARCHITECTURE.md` §11 item 2.

## 6. Definition of done
Gate green; row done. Tier 2 (push after the gate; a review is recommended).
