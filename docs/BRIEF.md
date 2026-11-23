# SkipWait brief — read this first (every AI model)

Sources of truth: `docs/DECISIONS.md` (the register; it wins over every other doc where grounded in the owner's latest word, and frozen decisions hold until the owner reopens them, D-225), `AGENTS.md` (rules and the live system map) and `docs/KIT_V4_BUILD_PLAN.md` §3b (the queue). If this brief disagrees, they win; fix it in the same push (D-073). Read them in full first.

## What SkipWait is
- skipwait.me: a job seeker sends one ask (an official careers-site or ATS job link, a resume, a short note); only that employer's work-email-verified employees can see, accept and refer.
- Goal (D-010, D-026): the go-to global site for job referrals, getting people referred faster. Compass: referrals are the product; credits are the revenue engine; quality is the moat; never risk anyone's money.

## Rules you must not break
- **Frozen to Nov 17 (D-059; P0s, new data or the owner's newer word only, e.g. D-132):** D-004, D-005, D-006, D-010, D-012(3), D-019, D-023, D-026, D-030 with D-049/D-057, D-031, D-039, D-041, D-042, D-044, D-055.
- **Login (D-030, D-049, D-057).** Seekers: Google, Microsoft, GitHub, LinkedIn, Slack, personal email (six-digit code; passwords from PR #324 after D-057 gate, D-163, never for covered work email, D-081), on skipwait.me, no authkit.app. Referrers: work-email code only on every visit/surface; use `referrerSignInHref()` (`client/src/lib/referrerSignIn.ts`), never `SignInButton`/`openSignIn`. Seeker passkeys approved, unbuilt (D-172/D-209, `DEVICE-SIGNIN-passkeys`); no referrer passkey, no Apple (D-333).
- **Identity.** One canonical person plus verified login aliases: match the exact alias first, never link or merge on an unverified email, never combine two people's credits, asks or referrals; a suspension or sign-out covers every alias.
- **Money.**
  - Never choose an option that spends the owner's money (D-031). Referrers are never paid; basic referring is free (D-055). Referrer priority plans (D-219 (7)) charge nothing until their routing is designed and tested.
  - Fairness (D-006, D-040): never sell referrals, a ranking of people, priority (except that unlaunched plan), visibility or seeker-to-referrer payments; company plans charge nothing until built and tested; employers buy only labeled ads and tooling; referrers never see a seeker's plan; at most 2 open asks per company.
  - A money path that cannot deliver is switched off, never deleted without the owner's say-so (D-042); nothing is offered that the code does not grant (D-044).
  - Credits: an ask to a company with an available referrer spends 1 credit at send (no credit, no ask); one to a company with none waits free (D-034, D-061), spends when a referrer first sees it, or is held if the seeker has none, never free/billed later (D-047). Pre-pickup withdrawal returns it once unless month/plan ended; post-pickup stays spent (D-021, D-050). D-035 rejected (D-147): all declines keep credits spent; reason display unapproved. D-038 unchanged. Expiry clocks (7-day unclaimed, 90-day cap, day-30 reconfirm (D-060)) suspended for launch (D-174); amounts unchanged.
  - Say it in referral-only words (D-173, D-180): no page says "credit(s)" or the noun "ask"; requested, accepted and submitted stay distinct. Import money lines from `shared/moneyCopy.ts`. Never call referrals simply "free".
  - Catalog: 3 free referrals a month at any level with a verified card (D-219; D-079 switch off), no welcome credits, no reverse trial (D-051); legacy packs paused (D-219, D-214); passes unsold (`PASS_SALES_ENABLED = false`); Pro/Max gone (D-067). Banded sync provisions prices only (D-367). "India price", no GST (D-007).
  - Pricing (D-219, docs/PRICING.md): frozen banded seeker plans with per-level extra referrals; D-132's credit model is superseded (code off). Nothing goes live without the owner's word (D-123). Writing rule (D-153, frozen): intent first: say what users can do, get and pay; promise only what works.
  - Seeker payments run only through Chargebee (Razorpay for INR, PayPal for USD; D-004). Never make a real payment (D-065): use test modes, mocks and fixtures. Read `docs/PAYMENTS_TEST_RUNBOOK.md` before touching payments, refunds or credits.
- **Privacy and trust.** A referrer sees no seeker name or resume, and no seeker can message a verified referrer, until that referrer accepts (D-019(e), D-012(3)). A block hides two people from each other everywhere, including delivery. No public per-referrer metrics, invented numbers, sample data, dark patterns, false urgency or pressure on referrers. Agents never reword Terms, Privacy, Refund or Cancellation (live legal text); list those lines for the owner in plan §6.
- **Basics always work (D-019).** Payments, logins and the seeker, referrer and admin flows. A broken basic is a P0: restore it, verify live, report. Changing how a basic works needs the owner.
- **No half-baked flows.** Ship a flow end to end or not at all: every failure is logged, alerted and shown in plain words; every screen handles loading, empty, error and offline; every money change is idempotent, reconciled, recoverable. A user with a pending action gets one idempotent email with a direct link, at most one a day (D-060).
- **Design (D-120, D-150).** Every screen, landing to admin, is redesigned to the goal doctrine, UI and UX (goal line, one next step, one black commit), never the old layout in black (`design/goal-ui/DOCTRINE.md`); until one moves, keep its tokens.
- **Public repo (D-059).** Never commit a secret or put one in a `VITE_*` key; no business numbers or personal data in docs, fixtures or commits.

- Off: [banded](plans/PRICING-banded-checkout.md); [D-193](plans/D-193-journey-foundations.md).

## Working with the owner

- **Roles (D-225):** Claude sessions build too (D-348). No step waits for one model. Ownership and required CI still apply; no review (D-347).
- Be brutally honest (D-023): risks first, the strongest counter-argument, ideas rated 1–10, "I don't know" over a guess. Each session: fetch `main`, read new decisions, report the log and rated ideas (D-026). D-123/D-126: research, decide on merit, ship flagged, report deviations.
- Never override a decision; recommend a better one with evidence. Value-adding features are pre-approved (D-091); the owner's word is still needed for real cash, posts in his name, prices or credit rules going live, new charges and anything that could upset users (D-123). Record decisions once in the register at highest ID + 1 across main/open branches; sync affected docs in the same push (D-068).

## How to pick work
- **`build`, `resume`, `continue`, `next` (D-225):** follow [the preflight](BUILD_CONTINUITY.md): fetch main, read current instructions/decisions and prior repo-only outcome, check goal/ownership; run `node scripts/next-task.mjs --claim "<your model name>"`, do only its task. Use its session-tagged name, never another's. Newer decisions beat packets: `--report blocked` with the ID; named work waits for packet `re-sync (D-nnn)` (D-202). `docs/plans/assignments.json` order: red main; own unfinished work (unowned pending above it first); unowned pending; new work. Red/blocked work holds lane/dependents; unmet dependencies hold landing only (D-315); red main holds landings (D-324). No push or `--heartbeat` for 2 hours frees a claim. `--report` to CEO on stop, landing, PR or blocker; `--status` shows the board. See `docs/DELEGATION.md` §4a.
- D-074: use your `docs/plans/` packet and only its named paths. Every PR lands on green required CI alone (auto-merge on); no review or model-name rule (D-370, D-373). D-235: one packet at a time; after handoff, preflight/pick without new `build`. Push every commit and before stopping. Test passwords stay in repo secrets; signed-in QA runs in Actions (D-373).

## How to ship
- Stack: Express, React, TypeScript, Azure MySQL (Drizzle), Tailwind, React Query; Cloudflare Containers and Pages; pnpm 10, Node 22+.
- Branch or worktree per lane; never force-push, rewrite history, `git reset --hard` a shared tree or commit others' files. Failing test first for logic. Zod at every boundary, shared contracts in `shared/`, no `any`. Every query checks the signed-in owner and company scope (MySQL has no RLS), with a cross-user test. Compute times in the app, never compare MySQL `NOW()` with `Date.now()`. Logs and Sentry carry no tokens, query strings, personal data or single-use links. No new dependency without the owner. Declare env keys in `.env.example`; server secrets need the `src/worker.ts` passthrough.
- Gate, on your commit merged with latest `origin/main`: `pnpm check`; `node scripts/design-token-audit.mjs`; `bash scripts/lint-deploy-migrations.sh`; `node scripts/check-deploy-triggers.mjs`; `LANG=en_US.UTF-8 pnpm vitest run`; `pnpm build`.
- **Green before `main` (D-082/D-370).** Integrate current main; land through protected PR auto-merge (merge commit) with exact required CI and main CI green. Only main's fix lands while it is red. No independent review, landing slot, direct main push or bypass. Docs-only changes use focused checks and required CI; moving main alone needs no full local re-gate. Never weaken a test or use `--no-verify`.
- **Release proof.** Deploys are path-filtered and wait for target main CI before migrations/uploads. Red, missing, skipped or superseded evidence refuses release. Retry/recovery: [`docs/DEPLOY.md`](DEPLOY.md). Verify web/API against expected deployed SHA, readiness and active revision; inspect changed UI at 1280/390. Clean task branches after live check (`node scripts/branch-cleanup.mjs --apply --only <id>`). Mark done only with exact release evidence.
- Migrations: the next free number on `main` (`drizzle/deploy/`) and in plan §5; never destructive; schema-dependent code lands only after its migration is verified.
- Owner actions: plan §6. System map: `AGENTS.md`.

## Group Plan (Oct 31)

Group bulk plans/referrals via candidate emails: 10% institution discount, verified-payment activation and emails. On-behalf consent, discount interaction and all holds remain: [packet](plans/GROUP-bulk-oct31.md). Not built or live.
