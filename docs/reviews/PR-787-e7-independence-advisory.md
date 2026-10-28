# PR #787: E7 and independence provenance (advisory)

Advisory only (D-225 reasoning role). This is not a review claim, a verdict or a PASS. It changes no code, test or registry file. It was written from read-only use of the repository and the GitHub API, and it reuses the coordinator's artifacts without re-deriving them.

- Head: `c404fe3b0185cd6098717793fe393a50f433fb2a`
- Base: `722651103a560324f8e7a66bfb188ac0123b1487`
- Date: 2026-10-28

## 1. Independence provenance

### Receipts that are publicly readable, and what each one shows

| Receipt | What it says | Is it proof of model family? |
|---|---|---|
| PR metadata | `user.login = ayodhyamohanthy`, draft, 15 commits; `get_reviews` returns `[]`, so there is no GitHub review at all. | No. One account opened the PR. |
| Fix-round commits `c632d7e`, `7846f4d`, `c404fe3` (`git log origin/main..c404fe3 --no-merges`) | Author = committer = `ayodhyamohanthy`; signature status `N` (unsigned); none carries a model or session trailer. | No. These commits carry no family label at all. |
| Builder commits `6868341`, `1849eb7`, `d35fd30`, `6e94abf`, `cc4849b`, `c022e9b` | Author = committer = `Deepseek-V4.1-Flash`; unsigned. | No. A git author name is free text that the pusher sets. |
| Prior-pass recording commit `eecddf3` | Author `ayodhyamohanthy`; the message body says "Reviewed head 8b6eccb3 as Qoder · 07fc". | No. It is a self-description in a commit message. |
| Marker commits on `agent/review/ci-architect-real-checks` | `3fcf740` review claim (deepseek … 02ad); `8fa1c31` and `8c6ef14` (Qoder · 07fc); `d5ae6cd` verdict pass (Qoder · 07fc); `f3ac55f` and `bd9d200` fix claim and Fixed (**Deepseek-V4.1-Flash · 6c91**); `5e353d2` review claim (**Cline · 70b5**). Every marker is authored by `ayodhyamohanthy` and unsigned. | No. These are picker labels pushed through one account. |
| Check runs on the head (run `40728467018`: typecheck, tests, build all `success`; Workers Builds is not a gate) | They prove that CI ran on this exact SHA. The triggering actor is the pushing account. *Unverified here: I did not fetch the run's `actor` or `triggering_actor`, but a `synchronize` push from `ayodhyamohanthy` would show that account.* | No. A check run identifies the account that pushed, not the model. |
| Comments `6474869956`, `6475071721`, `6475640627` | All three are posted by `ayodhyamohanthy` (OWNER). | No, as the coordinator already ruled. |

### What the labels claim, taken as labels only

- **Builder:** DeepSeek (`· 4352`).
- **Fixer of the H1/M1/L1 round:** DeepSeek (`· 6c91`, from marker `bd9d200`).
- **Superseded reviewer:** Qoder (`· 07fc`).
- **Current review lock:** Cline (`· 70b5`).

If those labels are true, D-151 needs a reviewer from neither the builder's family nor the fixer's family. Here both are DeepSeek, so any non-DeepSeek reviewer would satisfy the rule.

The labels do disagree on one point. The PR body and the fix-round commits do not name a fixer. Only the review-branch marker does. So "the fixer is DeepSeek" rests on one picker marker.

### What would establish independence

Each of the following is a receipt that the agent writing the commit cannot simply type for itself:

1. **Verified signatures** on the fix commits and the review markers, made with per-tool keys that the owner registered to each tool (for example `%G? = G` against an allowed-signers file kept outside the PR). Today every commit is unsigned: `N`.
2. **Distinct pushing identities.** That means a separate GitHub account or App installation per tool, so that the commit pusher, the check-run actor and the timeline actor differ between builder, fixer and reviewer. Today one account appears on every receipt.
3. **A vendor-side session receipt** that the owner can resolve, such as a session URL or ID in a trailer that the tool vendor's console confirms. Today none of the `CI-architect-real-checks` commits carries one.
4. **The owner's attestation**, recorded as a decision, binding each label (`Deepseek · 4352`, `Deepseek · 6c91`, `Cline · 70b5`) to a tool the owner actually ran.

### What is still missing

- **For the three fix-round commits that produced this head:** any non-self-asserted binding to a model family. The fixer's family is known only from the label on marker `bd9d200`.
- **For the reviewer holding the lock (`Cline · 70b5`):** any non-self-asserted binding.
- **The GitHub `actor` and `triggering_actor` for run `40728467018`.** These are readable; I did not read them. They can show only the account, not the family.
- **A publicly readable receipt that separates the families.** None exists. The only route to one is item 4 above, the owner's attestation, unless signing (item 1) or separate identities (item 2) are introduced for future work.

**Bottom line for Q1:** the public receipts establish the account, the SHA and the CI result. They cannot establish builder-versus-fixer-versus-reviewer independence for `c404fe3b`. That fact has to come from the owner.

## 2. E7 contract

### The narrow precedence

There are three contract lines in `docs/plans/CI-architect-real-checks.md` at the head:

- **Line 47, A3:** "a re-run of the same run -> same verdict from the same pinned SHAs".
- **Line 51, E7:** "re-run attempt N, or re-running failed jobs -> never the fast path".
- **Line 63, the corrected "rule now":** "Every push, dispatch and re-run runs the full steps."

For the one case where attempt 1 was `markerOnly`, A3 and E7 conflict. Three reasons settle it in E7's favour:

- E7 is a specific prohibition ("never"), and A3 is a general determinism property.
- Line 63 is the later, corrected statement of the rule, and it agrees with E7.
- A3 is listed under "A, pinned diff". The coherent reading is that A3 governs the **diff read**: the same SHAs give the same file list.

So E7 together with line 63 governs the **verdict**: any `run_attempt > 1` must be `markerOnly = false`.

### What the code does

`decide` at `scripts/classifyCiChange.mjs:149-151` returns "every push, dispatch and re-run runs the full steps" only when `eventName !== "pull_request"`. A re-run of a `pull_request` run keeps `GITHUB_EVENT_NAME = pull_request`, and nothing in `classify` (`:174` onward) or in `.github/workflows/ci.yml` reads `GITHUB_RUN_ATTEMPT` or `github.run_attempt`. A grep of the head confirms it: the only uses are in `require-green-release.mjs`.

The coordinator's attempt-2 result (`markerOnly: true`, `mode: merge-base`) is therefore exactly what the code produces. It is a **contract violation of E7 and of line 63**, and the reason text at `:150` is untrue for this case.

### Is it a substantive safety bypass?

**Not on content.** All of the classifier's inputs come from `github.event.pull_request.*`: `BASE_SHA` and `HEAD_SHA` at `ci.yml:53-54`, `66-67`, `118-119` and `128-129`; `EVENT_CLAIMED_EMPTY` at `:72` and `:130`; `BASE_IS_DEFAULT_BRANCH` at `:74` and `:131`. A re-run replays the original event payload, and git objects are immutable. So a re-run computes the merge-base diff of the same two commits and cannot fast-path content that differs from the pinned pair.

That rests on GitHub's documented re-run semantics: a re-run uses the same `GITHUB_SHA`, `GITHUB_REF` and event payload. *That is not verified on a live re-run here.* A new head is a new `synchronize` run with its own SHAs, which is A4.

**There is a residual risk, and it is the reason E7 exists: a red result laundered to green.** It is a different diff *result*, not different content:

1. Attempt 1 took the full path for a transient reason, such as E1 (a failed or shallow fetch), the L1 fallback (no merge base) or E5 (git failure), and failed red.
2. "Re-run failed jobs" or attempt N then reads the diff successfully, gets `markerOnly = true`, skips the steps and reports the required checks as `success`.

This does not ship different code. An empty merge-base diff means the head adds nothing over the merge base. But it does replace a red required check with a green one without ever running the steps that went red, and that is precisely the case E7 forbids.

**Severity:** a contract violation, low content risk. It is not "proven safe by pinned-SHA reuse". Pinned-SHA reuse proves the diff is the same. It does not prove the earlier verdict was the same, because the earlier verdict can come from a failed read.

### The minimal test that would close E7

Add one case to `scripts/classifyCiChange.test.ts` beside the existing E7 test at about line 248, which covers only push, dispatch, schedule and empty events. Drive `classify(env, reader)` with:

- `GITHUB_EVENT_NAME = "pull_request"`
- `GITHUB_RUN_ATTEMPT = "2"`
- pinned `BASE_SHA` and `HEAD_SHA`
- `EVENT_CLAIMED_EMPTY = "false"` (or `"true"`)
- `BASE_IS_DEFAULT_BRANCH = "true"`
- a reader stub returning `{ ok: true, files: [], identical: true, mode: "merge-base" }`, which is the coordinator's exact trusted-empty input

The case should expect:

- **Attempt `"2"`:** `markerOnly === false`, with a reason naming the re-run.
- **Control, attempt `"1"`:** `markerOnly === true`, so the gate does not kill the real fast path.
- **Fail closed:** an attempt that is absent, empty, `"0"`, non-numeric or negative gives `markerOnly === false`, in line with E2 and E3.

`GITHUB_RUN_ATTEMPT` is a default runner variable, so the workflow needs no change for the value to exist. Even so, a `ciMarkerSkip.test.ts` pin that the classify step does not override it would keep it honest. This is a test specification for the builder lane, not code from this session.

### Family receipts still missing for E7

Whoever adds the fix and the test gets the same provenance gap as in Q1. With today's receipts, that change would carry only a self-asserted label.

D-151 needs an E7 fix, and the review of it, from neither the builder's family nor the fixer's family (both DeepSeek by label). Today that cannot be shown publicly. It needs the owner's attestation, or signed commits or separate identities as in Q1. The receipts named in Q1 are still missing: a family binding for the fix commits (`c632d7e`, `7846f4d`, `c404fe3`) and for the reviewer holding the lock.

## Other observation (unverified intent)

The PR body still describes the retired rule: "A required job skips only when … `changed_files` … are each exactly the number 0", together with an `--expect-substantive` guard. This contradicts the corrected rule at packet line 63. A reviewer reading the body rather than the packet would review the wrong contract.
