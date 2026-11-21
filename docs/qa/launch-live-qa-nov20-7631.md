# November 20 launch QA: partial demo-account evidence

Status: **PARTIAL — do not merge PR #710 or mark LAUNCH-live-qa done.** Session GPT-6.1 Sol · 7631 continued the existing carrier after picker takeover `be40e6b49`.

## Release and scope

The canonical readback at 17:27 UTC on November 20, 2026 was web `a4e93b7965fcd684b6f57e4924fd3c3ce92245ab`, API `84614d5ad59421a4840b6ad6c6cf66b44f788e13`, API state `ready`. These are the identities read, not a claim that later main commits were deployed.

Only the fixed reviewer seeker and referrer accounts were used. Historical qa-sweep accounts were excluded. No referral was sent, no upload or claim/accept/decline/withdraw/block transition was performed, and no checkout, payment, paid email or notification was requested. Passwords, hashes, cookies, account identifiers, raw authenticated responses and private helper source are excluded from this evidence.

## Reproduced and repaired CI failure

Old [CI 44558393821](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44558393821) failed the assignment validator with:

```text
task LAUNCH-packs-unavailable: syncedTo is required (the newest decision its packet was checked against)
```

The same error reproduced after integrating current main. The stale branch-only row described paused legacy packs as an unresolved launch defect, contrary to D-219 (6)/D-214 (3). It is absent from current main. Commit `1a829c9f7` removes that obsolete addition, preserves the October evidence, and makes validation pass. [CI 44771375275](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44771375275) passed every required check. The subsequent gate-truth correction `c97bf43ad` passed [CI 44776951015](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44776951015). Neither green run completes live acceptance.

## Demo sign-in and authenticated reads

The existing D-366/D-369 credential path was dispatched before the newer protected-transport ruling was read. [Deployment 44775089424](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44775089424) completed successfully on API `84614d5a`, including readiness. An earlier queued dispatch was cancelled without starting a job. No further reset was dispatched after reading the November 20 credential-handling ruling from PR #1387. Future resets follow `OPS-reviewer-credential-transport`.

Both direct reviewer sign-ins returned HTTP 200 with `signedIn: true`, the correct role, and the expected redirect (`/plans` or `/referrer-home`). This proves the bounded reviewer exception, not a WorkOS OAuth or work-email OTP round trip. Session material stayed in restricted private storage. The temporary local browser handoff server was stopped after browser recovery failed.

At 17:18 UTC, real authenticated GETs returned the following sanitized results:

| Endpoint | Demo seeker | Demo referrer |
| --- | --- | --- |
| `/api/company-referrals/access` | 200; verified company access false, codeRequired false | 200; verified company access true, codeRequired false |
| `/api/company-referrals/mine` | 200; zero requests | 200; zero requests |
| `/api/company-referrals/inbox` | 403 | 200; zero requests |
| `/api/referrer/home-bundle` | 403 | 200; failed and unavailable lists empty |
| `/api/billing/receipts` | 200; zero receipts | 200; zero receipts |
| `/api/saved-roles` | 200; zero saved roles | 200; zero saved roles |
| `/api/blocks/mine` | 200; zero blocks | 200; zero blocks |
| `/api/admin/users` | 403 | 403 |

All 16 requests completed without a transport error. This demonstrates role boundaries and empty account reads. It does **not** demonstrate cross-user document isolation, populated request rendering, wallet stability, or a successful business transition. The credit summary was not requested; its provider-reconciliation behavior was inspected before deciding to leave that leg unexecuted.

## Browser capability result

The in-app browser previously rendered signed-out pages in this session. For this signed-in QA attempt it failed repeatedly:

```text
browser command playwright timed out (32000ms)
browser screenshot activity capture failed for guest
browser guest not attached (webview not ready)
```

The first private sign-in button action also timed out. Subsequent form submission navigated to the reviewer endpoint, but no browser sign-in result could be read. Navigating to Plans produced tab metadata with the Plans title, while DOM reads timed out. One fresh-tab recovery failed before attachment. These are tool failures, not evidence of a product regression or a successful UI pass. No fresh signed-in desktop or phone capture is claimed. Private helper processes were stopped.

## E2E and remaining acceptance

CI on the tested web commit `a4e93b796` and API commit `84614d5a` passed, including `e2e journeys` ([web-source CI](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44769334201), [API-source CI](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44773869883)). These are CI browser journeys, not this session's production signed-in UI proof.

The following remain unverified:

- Current signed-in screens at 1280 and 390, including loading/error/empty states and navigation.
- Current plans and paused-sale presentation in a signed-in browser.
- Wallet before/after stability and checkout refusal; no checkout POST is authorized by this packet.
- Real WorkOS and work-email OTP round trips; no code was sent.
- Job-link preview behavior using a current source-backed link.
- Cross-user document denial with known demo-owned fixtures.
- Upload, request creation, withdrawal, claim, acceptance, decline/reopen and block/unblock transitions. The demo accounts currently have no requests; this row does not grant an unsafe production fixture.
- Independent reproduction of the earlier session's reported WorkOS refresh console error, sample rows and terminology findings. Its report remains attributed and unverified by this session.

A capable browser session can continue using an approved demo session. If a new reset is needed, first complete the registered protected credential route. Preserve the draft, task status todo, historical captures, frozen money/login rules and all missing acceptance legs. No global product blocker is inferred from this session's browser capability failure.
