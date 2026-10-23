# D-179 - ATS connections to technically validate completed referrals

Source: founder message, Oct 24, 2026 1:09 AM IST. Provenance: phonemsg-01M5N4DC140W9347XWW34NAWX1 in conversation phoneconv-01M293K2H1ENERN9WSP2W33SPT (iMessage); runtime channel record author=user (observation-index verification pending at write time - same ~1-minute indexing lag as the earlier messages tonight, all of which confirmed). This packet records the direction; the channel record is the authority, not this file. Verbatim:

> We should connect to every ats to technically validate whether referral is done

## What this decides (and what it does not)

Goal: a referral marked done by a referrer should be technically validated against the company's ATS where possible, so the platform knows the referral was actually submitted.

This is DISTINCT from public job ingestion (company feeds, D-175/D-177 supply lanes). It concerns the completion side of the referral lifecycle.

Not decided, not authorized:
- No employer private access, no ATS credentials, no spend. Integration research is routed separately (market research seat); this packet does not invent universal ATS APIs.
- "Every ATS" is the ambition, not a claim: what each ATS can confirm, and what company permission/consent it needs, is UNKNOWN until the research returns. Capabilities differ per ATS; some may offer no completion signal at all.

## Product truth rule (must hold in copy and UI)

Until an ATS signal exists for a completion, the product must distinguish:
- **"referrer reported submitted"** (self-report, the current state), from
- **"ATS-confirmed"** (technical validation).

A self-report must never be labeled or treated as ATS-verified. Money/reward flows stay frozen under D-132/D-152 and must not key off an unverified status.

## Grounded feasibility (market research seat, Oct 24 1:10 IST - vendor developer docs read only; NOT integration-tested)

- **Greenhouse**: Harvest API application objects carry a `referrer` object (https://developers.greenhouse.io/harvest.html). Access needs a customer-admin API key; per-endpoint data access is documented as close to all-or-nothing, which raises a data-minimization design question before any connection.
- **Lever**: applications of type "referral" with a `referrer` user field, behind a `referrals:read:admin` scope (https://hire.lever.co/developer/documentation). Customer-created API key or OAuth via Lever's partner program.
- **Ashby / SmartRecruiters**: referral endpoints exist in docs; research incomplete.
- **Workday / SuccessFactors / Darwinbox / Zoho**: not covered by the research so far.

Consequences the design must honor:
1. **Employer-scoped authorization is the gate.** Every confirmation path sits behind that employer's own admin authorization. Public job feeds contain NO referral-completion signal. "Every ATS" is an ambition, never a promise; unconnected employers stay "reported by referrer".
2. **Matching is its own problem.** An application existing does not prove OUR referral: the candidate, the job, and the credited referrer must all match. A credited-referrer field is the employer's record, not independent verification of the employee's action. And a referral is not a hire.
3. **Data minimization needs design before connecting.** Broad ATS read scopes (Greenhouse's near-binary access) must not become skipwait silently holding full HR data; a scoped read or webhook design comes first.

## Open questions

1. Which ATSes (beyond the Greenhouse/Lever docs read) expose referral-completion signals, via what API/partnership, under what company consent?
2. Who grants the connection: the referrer (their employee account), the company (employer lane, D-048-P-employer), or a partnership?
3. What does the seeker see for each state, and does any money/credit event ever key off ATS-confirmed completion (owner decision, D-132 frozen)?
4. Fallback when a company has no supported ATS: self-report remains, labeled as such?

## Relation to existing work

- Referral lifecycle completion: the queue/ask lifecycle rows (ROW20-A lane) and the employer lane (D-048-P-employer).
- Job supply stays with D-175 feasibility / D-177 posting lanes - no overlap in this packet.

## Status

Recorded direction. No code, no integration, no spend. Grounded research findings get incorporated when the research seat returns them.
