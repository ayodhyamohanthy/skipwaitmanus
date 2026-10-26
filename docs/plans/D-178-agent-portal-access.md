# D-178 - External agents talking to the portal: sign in, pay, apply for referrals

Source: founder message, Oct 24, 2026 12:58 AM IST. Provenance: phonemsg-01M5N3RFHS5V5Y2MS5NBYCPT0M in conversation phoneconv-01M293K2H1ENERN9WSP2W33SPT (iMessage); the observation record shows author=user for that message ID (verified Oct 24 00:58 IST). This packet records the direction; the channel record is the authority, not this file. Verbatim:

> Agents should talk to our portal and they can sign in and pay and apply for referrals

## What this decides (and what it does not)

Product direction: external AI agents acting for a seeker should be able to use skipwait programmatically - authenticate, pay, and apply for referrals on their principal's behalf.

This is DIRECTION, not authority. Nothing here authorizes charging anyone, weakening authentication, or letting an agent act without its principal's verified consent. The protocol/interface is unspecified and must NOT be silently invented: no ad-hoc "agent endpoint" ships without the contract being designed and reviewed first.

## Design constraints before any build

1. **Delegated identity.** An agent acts for a specific user. The existing assistant-grant work (D-048-p3-assistants: /assistants, /approve, /connect-assistant, "approval preserves credits") and D-048-p3-agents (seeker agent grants, D-150) are the identity/grant substrate. Agent access must ride a user-scoped, revocable grant - never a shared agent credential, never the user's password or session cookie.
2. **Payment authority.** "Pay" by an agent is wallet-bearing on the user's behalf. It needs the user's explicit per-action or bounded approval, grounded in an existing grant - the same bar as any agent spending for a user. No agent-initiated charge without that. Founder no-spend rule and all money freezes (D-132/D-152) are untouched.
3. **Safe repeat/retry.** Agents retry. Apply-for-referral and pay must be idempotent (idempotency keys or natural uniqueness) so a retry never double-applies or double-charges. Existing outbox/charge patterns (D-067) are the reference.
4. **Protocol unspecified.** Candidates to evaluate in design, not chosen here: a public REST contract with scoped tokens, OAuth delegated grants, an agent-specific sign-in flow. The choice is a design decision with its own review.
5. **Existing contract work first.** Integrate with the assistant/auth/payment lanes already registered (D-048-p3-assistants, D-048-p3-agents, D-048-P-auth, seeker-passwords) instead of a parallel agent stack.

## Clarification, Oct 24 12:59 AM IST (same conversation)

Founder follow-up (phonemsg-01M5N3T0SZFH12MGASAEZ6MSCX, channel record verified author=user Oct 24 00:59 IST). Verbatim:

> Any  agent can connect to skipwait.me and can apply for referrals if they have paid for referrals

Applied reading (with Main, Oct 24):

1. **Any agent, not a named integration.** The contract is platform-agnostic: no per-provider partnership or allowlist of agent vendors is implied. Safeguards (scoped grant, consent, account isolation) apply to every agent equally.
2. **Payment-gated eligibility.** An agent may apply for referrals when the authenticated user it acts for has paid referral entitlement available (their paid ask balance). "If they have paid" conditions the ELIGIBILITY to apply; it never promises a referral outcome - referrers still decide.
3. **Free human allowance untouched.** The existing free monthly allowance for human seekers is NOT revoked by this directive; agent access is an additional path gated on paid entitlement. Removing or changing the free allowance would need its own explicit owner decision.
4. **Auth/consent/isolation stand.** Every agent still acts only within its authenticated user's account and grant; no shared access, no bypass, no retry-storm double-apply/double-charge.

## Clarification, Oct 24 1:01 AM IST (same conversation): Skippy action parity

Founder follow-up (phonemsg-01M5N3XV03FBKPFXF8DQPEXF50, channel record verified author=user Oct 24 1:02 IST). Verbatim:

> Skippy product assistant should be implemented  humans or bots  just use it  with natural language and get things done including payments, referrals, whatever everyone are bale to get on screen using ui , can be done in product assitant skippy and same should be done by agent bots too.

Applied reading (with Main, Oct 24):

1. **Skippy is the product assistant's name; it does the work, not just explains where to click.** Action parity rule: whatever a signed-in user can do on screen - finding jobs, requesting referrals, making payments, managing the account - must also be doable in natural language inside Skippy, for humans AND bots, and by outside agent bots through the D-178 contract. Same capabilities on all three paths.
2. **Same safeguards on all three paths.** The existing account permissions, prices, payment approvals and consent apply identically; no parallel permissive backend, no duplicate charges or requests on retries, clear results. Parity is of CAPABILITY, never of privilege.
3. **Not end-to-end yet.** This is the implementation rule, acknowledged as not currently supported end to end. Grounding work: inventory the actual UI actions, map them against the current Skippy/assistant implementation (D-048-p3-skippy redesign, the held assistant work #563 and the paid-tool contract - relevant but NOT assumed complete), and carry the gaps into the build instead of claiming parity.

## Open questions

1. Paid entitlement = the user's EXISTING paid referral balance (the credit ledger wallet: purchased packs sit alongside the free monthly plan_grant allowance; see server/creditCycles.ts and the billing catalog). The founder's words are "if they have paid for referrals" - the grounded reading is the agent spends the signed-in user's existing paid balance with that user's approval. No agent-scoped purchase, price fork, or new payment product is requested or to be manufactured. (Money wording stays frozen under D-132/D-152 either way.) UNRESOLVED: whether the free monthly allowance is agent-spendable. The founder's words settle only the paid path - an agent may apply when the user's paid balance covers it - and do not revoke the free human allowance. Nothing here settles a universal human-only or agent-eligible policy for the free allowance: no default, no activation either way, until the owner decides.
2. What does the user see and approve for each agent action (per-action approval vs standing grant with limits)?
3. Rate limits and abuse controls for agent traffic vs human traffic?
4. How is an agent identified and attested (user-declared API token vs verified agent identity)?

## Status

Recorded direction. No code. Implementation belongs to the assistant/auth lanes after the contract design exists and is reviewed.
