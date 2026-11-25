# Admin operations retirement evidence

Task `D-048-K-admin-ops`, session `GPT-6.1 Sol · 6f46`, November 19, 2026, PR #1332. This compares the already released goal pages before and after deleting their legacy route bodies. Synthetic local data only; no production admin account, payment, migration or business mutation is used.

The existing `../capture.mjs` driver serves 18 scenarios at 390×844@2x and 1280×900@1x: activity populated/empty/error/guest; flow health populated/unavailable baseline/error; schema pending/reconciled; smoke role selection/active/disabled; partners populated/sponsored/selected sponsorship/denied/empty/guest. It fulfills every API call in the browser and blocks external requests. The current signup-language hook has an explicit synthetic response. Intentional mocked HTTP/API failure/denial logs and the local SDK-configuration diagnostic remain in the manifests; no claim is made that those diagnostics are absent.

`before/source-receipt.json` and `after/source-receipt.json` bind each set to its static build identity and five page-source blobs. Baseline runtime is `57cc382a`; retired runtime is `e4932b36`. The capture driver can run from a later tooling-only revision, so that identity is recorded separately. Production builds use their RELEASED list, with no surface override.

The driver now asserts that the actual viewport matches its manifest. The initial runner's three height-expansion passes failed the schema-phone regression at **390×3631**, despite claiming **390×844**. Removing that loop preserves `dvh` and responsive behavior while `fullPage` still captures the full document. Both image sets are regenerated with the corrected driver. Earlier release images remain preserved outside this directory.

Run an existing production build on a loopback preview, then capture into a fresh directory:

```sh
CAPTURE_BASE=http://127.0.0.1:5199 node design/goal-ui/captures/admin-ops/capture.mjs all /absolute/path/to/output
```

After placing the unedited generated sets in `before/` and `after/`, compare them:

```sh
node design/goal-ui/captures/admin-ops/retirement-6f46/compare.mjs
```

The comparison verifies scenario/state/viewport equivalence, no nested interactive controls, zero unmatched API calls and no uncaught page errors. It records PNG SHA-256 hashes, decoded pixel equality and exact bounds for any differing pixels in `comparison.json`. All 36 before/after PNG and decoded-pixel pairs are identical. These files prove local visual parity; canonical post-deploy acceptance is recorded separately.

The original root-element scroll-width metric reports zero, but full-document PNG width exposes four existing phone-layout findings in both versions. Expected PNG width at 390@2x is 780 pixels: flow-health populated is 1464, flow-health without baseline is 1140, and the two schema states are 1270. The global zero-overflow interpretation is therefore withdrawn. `comparison.json` records the root metric and the document-width findings separately. These are unchanged goal-page layout issues, outside the retirement source delta; follow-up `D-048-admin-ops-mobile-width` owns their repair and an actual browser/PNG-width regression. No screenshot is cropped or resized to conceal the findings.
