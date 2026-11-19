# Policy retirement comparison

These captures use the local production build and anonymous auth fixtures. The browser sends no external request or mutation. The one global auth read returns a synthetic signed-out response; no customer or provider data is used.

The `before` build is from `9a00a9b5`, before either reading entry changed. It contains the current D-365 legal identity wording. The generator records every declared policy route at 1280×900 and 390×844, including the three guide routes. Its manifests retain source/build identities, legal-data and goal-implementation hashes, all visible text and links, anchors, API paths, blocked writes and raw diagnostics.

The local build has no WorkOS client ID. The exact existing message `[auth] VITE_WORKOS_CLIENT_ID is not set; falling back to server-session-only auth` remains in `consoleErrors`; only that message is classified as an expected local configuration diagnostic. Page errors and all other console errors fail the capture. This fixture does not establish production auth behavior.

To reproduce the baseline, check out `9a00a9b5` in a separate worktree, install its frozen lockfile, and copy `capture.mjs` into the same relative directory there. From that baseline root run:

```sh
pnpm build
pnpm exec tsx design/goal-ui/captures/policy/retirement-d859/capture.mjs before
```

Copy the generated `before/` directory and `before.json` unchanged into this comparison checkout. At its committed runtime head, run:

```sh
pnpm build
pnpm exec tsx design/goal-ui/captures/policy/retirement-d859/capture.mjs after
```

The after phase requires unchanged legal/data/goal implementation hashes and identical visible text, links and API behavior for every route/viewport pair. It reports every differing image pixel without a tolerance or mask. The policy wrapper still has non-policy callers, including `/support`; their existing fallback is retained and tested separately. Only the declared policy routes and guides lose their feature switch.

## Ported assertions

No existing case or test file is deleted. Legal, billing, privacy, contact and published-identity assertions stay.

| Existing coverage | Retirement destination |
| --- | --- |
| Eight policy flag-off/flag-on legal-body and summary comparisons | Each page opens on its default goal frame. A transparent shell spy captures the unchanged page props; the complete rendered article is compared to a plain reference containing every supplied intro, child clause, footnote and support line. Summary bullets are compared to the supplied data. H1, breadcrumb presence, body length and zero component fetches remain. Guidelines keeps its existing absence of a registered breadcrumb. |
| Three guide flag-off/flag-on section/FAQ comparisons | Default goal rendering is compared against every heading, paragraph, point, question and answer from the immutable guide catalog; one H1, breadcrumb and zero component fetches remain. Related-guide destinations are additionally checked. |
| Terms/Guidelines legacy H1 and branded terminal | Existing published goal H1 and retained page label; complete legal clauses and payment/privacy promises are unchanged. |
| Legacy Legal header/current link and ten-link footer | Existing goal current breadcrumb and canonical Terms URL; the exact nine-link goal footer plus Pricing in the Site header preserve every destination. Shipping uses the existing goal footer label Refunds with the same /refunds destination. |
| Reading-frame drift test with the old override off/on | Both original sets of supplied-word assertions remain; each render must now use the goal frame regardless of the retired override. Email-template cases are unchanged. |
| Support promises and published identity | Existing suites and source/data are unchanged; the non-policy fallback remains. |

The added retirement suite proves default policy and guide rendering and the absence of the feature switch from both entries. Its three cases fail on the baseline. Baseline legal-text controls pass 12/12 before the cutover; the six-file candidate run passes 48/48.
