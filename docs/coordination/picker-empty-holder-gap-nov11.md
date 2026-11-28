# Picker empty-holder relinquish gap, November 11

Observed on main c5f697a8d01fa92dbe0bdbea2c4f9b5ce747869f.
Task: PICKER-authoritative-ref-refresh. No source implementation is completed.

The initial qualified Mistral resource could not consume the full input or
produce a qualified patch. Its ordinary empty build claim remains in history.
PR #1141 admitted a separately observed DeepSeek author route and distinct Claude
review route, but route admission does not transfer an active build holder.
The actual supported preview for the new operator returned WAIT: the old build
holder was still active, not quiet for the ordinary two-hour takeover interval.
No source dispatch, new build claim, manual transfer or abandonment marker was
invented to bypass that result.

Reading the actual CLI, core and lease paths confirms the gap:
- Reports accept green/red/blocked/review/landed, but do not release a build holder.
- A blocked report opens unblocking work, not a new qualified build claim.
- The landed action releases a landing slot only, not an unfinished build claim.
- Heartbeats retain or reclaim ownership; no build release/transfer action exists.
- The normal takeover requires genuine elapsed quiet time. No timestamp may be
  backdated, heartbeat hidden, branch deleted, operator renamed or marker forged.

The existing empty-contribution provenance exception is not a takeover grant.
It requires the next qualified build claim to be in evaluated head ancestry and
EVERY intervening commit to be single-parent and empty. Preserve the initial
empty branch unchanged until a genuine next qualified claim; merging main into
that interval would defeat this proof. Completed code and execution receipts
remain separately required. The loader-only D-312 exception does not apply.

Current continuation: prepare the complete public context as bounded transport
chunks without asking the model to implement. Check actual current claim and
heartbeat age once at the genuine eligibility boundary, then use the ordinary
picker only if it offers the supported takeover. Reassess live state then.
Independent disjoint work and normal reviewed docs landing continue meanwhile.

This records an unsupported relinquish mechanic, not a new policy or a repair.
Any future implementation needs its own bounded registered ownership, actual
qualified author, real red-first tests, independent review and protected landing.
No current source scope, queue order, ownership, auth hold or product rule changes.
