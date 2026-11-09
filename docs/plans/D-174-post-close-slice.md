# D-174 posted-role Close binding slice

## Existing defect, not a new product flow
D193 section5.1 requires clearing a picked post when its drawer closes or a generic ask opens. Current main reproduces: pick role88, Close, open generic hero ask, enter another job URL, send. The intercepted JSON still contains opportunityId88 and would route the unrelated ask first to the old poster. The isolated Close test is red first, then green after one ExploreCompany close-handler hunk invokes existing composer.selectPost(null). Existing24drawer/prefill controls pass. No real request, customer credit or provider sign-in used in this evidence.

## Bounded coordinated handoff
This child carries only client/src/pages/ExploreCompany.tsx and new client/src/pages/exploreCompany.closePostBinding.test.tsx. Existing922/804ae119 ca85 lineage, original row ownership/dependencies/status and other requirements remain intact. No owner ACK or absence-of-conflict guarantee is claimed. Current published parent source was inspected; no newer runtime writer was observed. The coordinator must reintegrate this close hunk before the parent resumes the same path. This is isolated incremental repair, not a declaration that the parent is done or that its other holds vanished. No server, storage, pricing, sign-in return, legal copy or selected-role read-only control changes.

The parent row owns ExploreCompany, so this child declares no owns and uses the same d174-fix lane. Automated scope-check therefore cannot enforce the allowlist: manual exact2path diff plus independent review is required. No artificial scheduling dependency is added, no gate weakened, no parent branch overwritten. This explicit manual limitation is not permission inferred from the registry.

## Scope and evidence
Authenticated owner20:29-30 instructions prioritize easiest tested production slices independently: phonemsg-01M70D3W4Z5NV0NRPG6DD3JQMN, phonemsg-01M70D415K52P2VQ1TWPT2TA64, phonemsg-01M70D4F2MAEKF35A16EWKVVBY, phonemsg-01M70D6A0PXHX50FSW20RRJ5BH, phonemsg-01M70D6DYMKS3YCSG34NQSV7E0. Original sources were read in the authenticated conversation separately. This packet records scope, not authority. Testing, qualified separate final-version review, current-main composition and protected merge remain; no money, account or product-policy change follows from urgency.

Actual local production build1280/390 interactions pick→Close→generic reopen→filled send were run with synthetic API identity/data and network interception. Captured outgoing body has newcustomhero URL and NOopportunityId at both widths. Screenshots inspected after animations settle; no real send or credit used. This is local behavior/visual proof, not deployed-provider acceptance. Five other old922fixture failures remain separate, not fixed or adopted here. Build passes. Normal exact-head CI plus current-production smoke required before reporting shipped; no temporarytestcookie on production.

## Status
D-174-post-close-slice: done — 4ee70381 (independent pass by Qoder · eb18; landed by Qoder · 97db under D-082 on a clean merge of main, full gate green). Parent 922 is not complete: its other cases stay open.
