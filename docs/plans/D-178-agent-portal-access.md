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

## Open questions

1. Which agent actions are in scope first: read-only discovery (companies/jobs), ask submission, payment, or all three?
2. What does the user see and approve for each agent action (per-action approval vs standing grant with limits)?
3. Rate limits and abuse controls for agent traffic vs human traffic?
4. How is an agent identified and attested (user-declared API token vs verified agent identity)?

## Status

Recorded direction. No code. Implementation belongs to the assistant/auth lanes after the contract design exists and is reviewed.
