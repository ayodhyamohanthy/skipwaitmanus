# D-093.menu browser proof

This is local, intercepted browser verification of the real AccountMenu and existing GoalLanguagePicker. It is not a language approval, production activation or completed dependency acceptance.

## Source and results

- Baseline main: `d26b995ef4e0654e8540a61dafad38b0cdd71f52`.
- Candidate app: `1adb4a4fe6`; corrected test/build head: `b00faaadaf`. Subsequent composition `c9c04a43d` imports only main's assignment metadata, with no app-source change.
- Normal production: **2 before/after decoded-pixel-identical pairs** at 1280×900 and 390×844@2x. Visible text and request multisets match. The actual English-only registry exposes no Language entry and opening the account menu saves no language.
- Synthetic two-language build: **8 screenshots**, menu/picker/selected/closed at both widths. The real page and native controls open the picker, preserve focus, save exactly `{ "language": "hi" }` locally and through an intercepted account-preferences PUT, and close on Escape with focus restored to the account trigger. The page URL never changes.
- Entry, select and Done hit targets measure at least 44px. The popover stays inside both viewports. An expanded Hindi endonym remains readable at 390; native inspection covers phone entry/picker and normal desktop menu. The detector reports no findings.
- Every capture has zero horizontal overflow, page errors and unmatched API requests. All backend, auth and external traffic is fulfilled locally; no real sign-in, preference, email or payment action occurs.

The complete assertions, request lists, source/registry hashes and screenshots are in `verified/capture.json`; only a fully completed run writes `verified/parity.json`.

## The synthetic language fixture is not production

`fixture-build.mjs` loads the project's real production Vite setup and applies a strict in-memory transform to the existing Hindi registry entry for a disposable bundle. It also expands that fixture endonym. The on-disk `shared/languages.ts` is hashed before/after and must stay byte-identical. No language file, reviewed flag, capture switch, package or real production output is modified. The test-only output is removed after browser verification.

The service-worker stamping plugin is excluded only from this disposable build because its old hook writes a fixed `dist/public/sw.js` path; every production build keeps the normal plugin. Screenshots tagged `two-language-fixture` prove the future visible-state integration, not that Hindi is reviewed or released. The browser uses real page clicks/select controls, never DOM injection or a hidden product flag.

## Host-selection finding and limitation

The first attempt used `/requests` and could not open Settings. Source inspection found its unchanged GoalAppShell passes initials without `account.menu`, so GoalShell renders an inert fallback avatar, not AccountMenu. That shell-mount gap is reported to the separate GoalAppShell/D-093.mount lane; this row does not claim to fix it.

The corrected run uses the existing real `/start` consumer (`GoalStart.tsx:79`) and asserts `aria-haspopup="menu"` before clicking. All successful screenshots are from that route. The failed attempt contributes no passing pair, and no control was added to that page to make QA pass.

## Reproduce

```sh
git worktree add --detach ../language-menu-baseline d26b995ef4e0654e8540a61dafad38b0cdd71f52
(cd ../language-menu-baseline && pnpm install --frozen-lockfile && pnpm build)
pnpm install --frozen-lockfile
pnpm build
node docs/evidence/D-093-menu/capture.mjs ../language-menu-baseline .
```

The harness rebuilds its isolated fixture and takes fresh screenshots. The candidate's normal production build must be completed first. The earlier draft-only precaution was superseded after verifying protected-merged picker PR #1130, its green exact-head checks and the existing queue's merged-dependency completion rule. Its raw `todo` stamp is metadata drift, not a separate activation approval. The parent language release/translation holds remain unchanged. No language beyond English is enabled by this task.
