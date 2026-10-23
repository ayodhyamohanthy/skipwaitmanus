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

## Open questions

1. Which ATSes (Greenhouse, Lever, Workday, Ashby, ...) expose referral-completion signals, via what API/partnership, under what company consent?
2. Who grants the connection: the referrer (their employee account), the company (employer lane, D-048-P-employer), or a partnership?
3. What does the seeker see for each state, and does any money/credit event ever key off ATS-confirmed completion (owner decision, D-132 frozen)?
4. Fallback when a company has no supported ATS: self-report remains, labeled as such?

## Relation to existing work

- Referral lifecycle completion: the queue/ask lifecycle rows (ROW20-A lane) and the employer lane (D-048-P-employer).
- Job supply stays with D-175 feasibility / D-177 posting lanes - no overlap in this packet.

## Status

Recorded direction. No code, no integration, no spend. Grounded research findings get incorporated when the research seat returns them.
