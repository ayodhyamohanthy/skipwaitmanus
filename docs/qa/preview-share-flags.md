# QA preview: share cards + company signal (flags ON, fictional fixtures)

Branch `agent/instinct/qa-preview-share` merges the four draft PRs (#373 company signal, #375 seeker win card, #381 level classifier, #382 referrer impact card) so QA can verify cross-side behavior in one build. It is a preview integration branch: feature work lands from the individual PRs, not from here.

## Deploy (automatic, same credentials as the prod pipeline)
`.github/workflows/deploy-qa.yml` deploys this branch to the skipwait-qa worker on every push (migrations gate first, typecheck, build with the client flags ON, `wrangler deploy --env qa`). It reuses the repo's existing CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID and DB secrets - no new credentials. It NEVER touches prod: separate worker name, separate scratch database `skipwait_qa` (created on the MySQL server 2026-10-21; the pipeline DB user has been granted privileges on it). The qa worker gets its own DATABASE_URL (pointed at skipwait_qa) and JWT_SECRET secrets on first deploy.
First-time seed: run the workflow manually (Actions -> Deploy QA preview -> Run workflow -> seed=true). Re-seed the same way whenever fixtures go stale.
Qa has no WorkOS vars, so sign-in uses the dev-auth path. Billing is forced to test.

## Seed the scratch database
`DATABASE_URL=mysql://user:pass@host/skipwait_qa npx tsx scripts/qa-seed-share-fixtures.ts`
The script refuses any database whose name does not contain "qa" (override: SKIPWAIT_QA_SEED_CONFIRM=yes). It inserts fictional Quillmint fixtures:
- company Quillmint + quillmint.com domain, 4 verified referrers
- referrer A (vanity alias QuietFalcon): 3 answered asks (2 approve, 1 pass; one progressed to intro_made) - impact card VISIBLE
- referrer B: 2 answered asks - impact card HIDDEN (min-3 gate)
- one seeker with an accepted ask (win card state)

## What QA verifies (cross-side regression, all four PRs)
- Company signal shows on /explore/quillmint (3+ referrers, min-3 satisfied); name-only job company value never counts (fixture test covers the join rule).
- Referrer A sees the impact card on /referrer-home; clipboard text carries aggregates + screen name only; B sees nothing.
- Seeker sees the win card on their accepted thread; "Accepted" badge (not "Referred") until intro_made.
- Level classifier: no surface consumes it yet; nothing to click (flag-off groundwork).

## Safety correction (Oct 21)
Deployment is NOT approved: a second container has usage costs. Workflow is manual-only; no branch push deploys it. No successful deploy or preview URL exists yet.
QA uses only skipwaitqa, whose grants are scoped to skipwait_qa.*. Never use the admin login in QA Actions.
Initialize schema with drizzle-kit push from schema.ts, NOT the deploy migrations: those include historical real-user imports. Never copy production rows.
Dockerfile.qa bakes the three client flags on. env.qa uses a separate lite container, no production routes, no cron, NODE_ENV=test (otherwise missing WorkOS fails closed). Basic Auth gates the entire workers.dev origin. QA_PREVIEW=true with no gate secret returns 503, never opens the preview. Store the generated gate only in vault/repo/Worker secret stores, never chat.
