# QA preview: share cards + company signal (flags ON, fictional fixtures)

Branch `agent/instinct/qa-preview-share` merges the four draft PRs (#373 company signal, #375 seeker win card, #381 level classifier, #382 referrer impact card) so QA can verify cross-side behavior in one build. It is a preview integration branch: feature work lands from the individual PRs, not from here.

## Deploy (owner/CI holds Cloudflare credentials)
1. Build with the client flags on: `VITE_COMPANY_RESPONSE_SIGNAL=true VITE_SHARE_WIN_CARD=true VITE_SHARE_IMPACT_CARD=true pnpm build`
2. Deploy the qa worker env (flags on in `wrangler.jsonc` env.qa; billing forced to test): `wrangler deploy --env qa`
3. Set the qa worker's DATABASE_URL secret to a SCRATCH database (e.g. `skipwait_qa` on the MySQL server). Never prod.

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
