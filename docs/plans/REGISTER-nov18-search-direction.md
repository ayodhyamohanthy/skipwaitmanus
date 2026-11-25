# REGISTER-nov18-search-direction — register D-360 (owner search and sourcing direction, Nov 18 2026)

Docs-only registration. No product code, no runtime delta, no vendor selection, no coverage claim.

## Scope

1. `docs/DECISIONS.md`: new entry **D-360** recording the owner's Nov 18 (21:42–22:07 IST, WhatsApp) search and sourcing direction with verbatim quotes and message IDs as evidence:
   - one universal no-brainer search input: company or brand name, job title, description, pasted job URL, and any other input with a probability of meaning something; the user never picks an input type;
   - no job IDs demanded from users — IDs, links and requisition identifiers are resolved and carried behind the scenes;
   - searching a company returns that company's jobs, careers-page style;
   - search is useful to visitors with no referral intent (standalone value);
   - jobs show with or without referrers, referral availability labeled per job; the empty state reads "No referrers yet" with a share invite;
   - automation-first within budget and source permissions; manual/grit effort fills gaps inside the same system, never a separate strategy or a premature retreat to workarounds.
2. `AGENTS.md`: product-compass item 5 summarizing the direction, pointing to D-360.
3. `docs/plans/assignments.json`: this registry row (tier 3, lane `register`, status `todo`; marked `done` only after the pull request lands on main).

## Explicitly out of scope / not claimed

- Nothing here is a shipped capability; no universal worldwide coverage exists or is promised.
- The sourcing architecture discussed the same evening (free CC0 company identity from Wikidata/GLEIF, employer ATS feeds such as Greenhouse/Lever, pasted-URL resolution, aliases and probable-match handling, automatic job-to-referral-request binding) remains a proposal for future rows, not an owner decision.
- Data vendors and APIs (Remotive, Adzuna, ATS-feed reuse, aggregators) stay unverified candidates with open permission questions, not selected vendors. The free-only money rule (D-031) and per-source reuse-permission checks gate every build.
- No existing row's owns, dependencies or acceptance changes. Affects tasks: none.

## Evidence

Owner WhatsApp messages, Nov 18 2026 (IST), relayed by the main agent with the originals preserved in the Instinct observation record:

- 21:42 "The concept should be users can search the company name and they should get jobs like career pages" (`wamid.HBgMOTE3MjA3MjM0ODgzFQIAEhggQUMyMDIyQzVCMURDOUFFMTU1MkI4RDA4REI5NDBCMkQA`)
- 21:42 "As not everyone has job IDs" (`wamid.HBgMOTE3MjA3MjM0ODgzFQIAEhggQUNEMERCMUIxQUQxNEQ0RTBEOUFDMURCN0RGRUU4QzAA`)
- 21:45 universal no-brainer input (`wamid.HBgMOTE3MjA3MjM0ODgzFQIAEhggQUMwMDdFMTkzM0RGMjI1NDA1MDM0NzU4REIyMzQyNUUA`)
- 21:46 user-centric, non-referral visitors too (`wamid.HBgMOTE3MjA3MjM0ODgzFQIAEhggQUMyMjc5NTNFOTVBOTc5RDU5RkQ4RTY5MzVEQTEzRkYA`)
- 21:47 "No referrers yet" plus share invite (`wamid.HBgMOTE3MjA3MjM0ODgzFQIAEhggQUNBRkRDQUNBNDcxMzRGOTQ4OTM2RTRFODk0MTJBOTIA`)
- 22:02 automation-first strategy (`wamid.HBgMOTE3MjA3MjM0ODgzFQIAEhggQUNERTc5Qzk0OTlFOEJFQkFGNDNBQjkwOTE3QzM5RjkA`)
- 22:07 push the decision to the repo (`wamid.HBgMOTE3MjA3MjM0ODgzFQIAEhggQUMzQzY0MzRFNEU5RUE0NzQxMkM3NzU4MkMwOURBMzIA`)
- 22:07 scope: "company names, job titles , urls and all other possibilities users can search" (`wamid.HBgMOTE3MjA3MjM0ODgzFQIAEhggQUNCOUM3NDYxQzVGOTdFQ0JENzgyQUZDM0U0RDUzQjMA`)

## Acceptance

- D-360 present in `docs/DECISIONS.md` with evidence and the not-claimed boundaries above.
- `AGENTS.md` product compass names the direction and points to D-360.
- `node scripts/decision-id-check.mjs` passes; the assignments validation test (`scripts/nextTask.test.ts` — "is valid and every packet it names exists") passes with this packet under `docs/plans/`.
