# Packet D-048-dark-mode: light and dark mode across the goal UI, light unchanged (#646)

> Read `docs/BRIEF.md` first, then this packet.

| Field | Value |
|---|---|
| Queue row | `D-048-dark-mode` in `docs/plans/assignments.json` |
| Decisions | The owner's direction relayed in #645 and #646: "Have light and dark mode", "In our platform", and the Oct 25 00:52 IST approval of the dark colour counterpart. That approval sets the verified mark to `#60A5FA` and the commit to `#FAFAFA` on dark, and keeps the light palette pixel-unchanged. It approves no layout, default-theme or system-follow change. Also D-150 and D-120. |
| Risk tier | 2 (visual only: no money, sign-in or data) |
| Verified against | `main` `1b4d9939` on 2026-10-25 |

## 1. Goal
A person can switch the product to dark and back, on every goal-UI surface, desktop and phone. Light stays exactly as it is today and stays the default.

## 2. Current behaviour (verified in #646)
- `client/` (the product): `ThemeProvider` in `client/src/App.tsx` is `defaultTheme="light"` and not switchable. It has no toggle and no persistence.
- The `g-*` goal tokens at the end of `client/src/index.css` have no dark values. Only the retired kit tokens have a legacy `.dark` block.
- `app/` has a working pattern to borrow: a Settings toggle persisting `sw-theme`, and a pre-paint apply script.
- `DESIGN.md:12` says "Light mode only". The owner's direction supersedes that line for the dark counterpart. The doctrine's semantic rules stay: trust blue on verified marks only, and exactly one solid commit per screen.

## 3. Target behaviour
1. **Tokens (designer step, one commit).** Add a new `client/src/styles/goalDark.css` with a `.dark .g-scope` block that redefines every `g-*` colour token and sets `color-scheme: dark`. Import it from `index.css` (switch only: one `@import` line).
   - Use the exact values in the approved 1280/390 captures (approval question phonemsg-01M5QNHZBRT4V52R6Y8FJ3CVGP, held by the Instinct coordinator): the verified mark `#60A5FA` and the commit `#FAFAFA`.
   - A token the captures do not show takes the smallest change that passes WCAG AA: 4.5:1 for text, 3:1 for non-text against its own background.
   - The pull request carries a table of every token: light value, dark value, background, contrast ratio.
   - No light token changes.
2. **Toggle.** `ThemeProvider` becomes switchable, persists the choice per device in `localStorage` key `sw-theme` (wrapped in try/catch), and applies it before first paint so there is no flash. The default stays light. Following the system setting is not approved: never read `prefers-color-scheme` to choose the default.
   - Place one "Appearance: Light / Dark" control in the goal More menu (`GoalMoreMenu`). It is a ghost control, never a second solid commit.
3. **Landing hero.** The forced-light `.dark .launch-hero` exception from `app/` does not exist in `client/`. If the signed-out landing has a photo band that fails contrast in dark, the designer proposes a treatment in the pull request with captures. It ships only if it passes AA; otherwise the band stays light in both modes, like `app/`.
4. **Acceptance per surface.** A surface counts as dark-ready only with 1280 and 390 captures in both modes on the pull request. Theme classes alone are not proof (the owner's rule).
   - This row ships the system plus the shell and the top seeker journey: `/`, `/explore`, `/ask`, `/requests` and `/plans`.
   - Every other surface is listed in the pull request as "light only until captured". It goes dark-ready as its own D-048 row moves it.
5. **Docs.** `DESIGN.md:12` becomes "Light by default; a dark counterpart with the values in `client/src/styles/goalDark.css` (owner, Oct 25)".

## 4. Files
- **New:** `client/src/styles/goalDark.css`, `client/src/contexts/themeContext.test.tsx`, `client/src/components/goal/goalTheme.test.tsx`.
- `client/src/index.css (switch only)`.
- `client/src/contexts/ThemeContext.tsx`.
- `client/src/App.tsx (switch only)`: the provider props.
- `client/src/components/goal/GoalMoreMenu.tsx` and `client/src/components/goal/goalMoreMenu.test.tsx`.
- `client/index.html (switch only)`: the pre-paint script.
- `DESIGN.md`.
- `scripts/designTokenAuditCore.mjs` and `scripts/designTokenAudit.test.ts` (bounded dark-token compatibility only, below).
- Out of scope: every page component. A page that hard-codes a colour outside the tokens is listed in the pull request for its own row, never patched here.

## Audit compatibility contract (unblocks the existing row, no palette change)

The existing R8 audit permits only `index.css` and `kit.css` and rejects every `--g-*` occurrence outside `index.css`. That contradicts this packet's required `goalDark.css`. The row owns the audit core and its fixture tests solely to admit that exact dark counterpart while keeping the light source of truth frozen:

- Permit the exact path `client/src/styles/goalDark.css`, not another CSS directory or a wildcard. R8 continues rejecting every other extra stylesheet and every `--g-*` declaration outside the two exact token sources.
- In that file permit only the `.dark .g-scope` block, `color-scheme: dark` and overrides of existing goal colour tokens. No light selectors, `:root`, unrelated declarations, imports, nested rules, font/layout/motion token overrides, or new token names. Invalid syntax fails closed. Comments must not hide a second rule or bypass a check.
- Keep the index.css A3 allowlist, R7 exact light token tables, R2 trust-mark-only use and every other existing audit rule unchanged. Do not add the dark blue to the global light allowlist or allow arbitrary hexes everywhere.
- Test approved dark counterpart coverage separately: every existing goal colour token is covered once, no duplicate overrides or missing tokens, verified-mark blue and commit colours match the source-grounded approved counterpart, and contrast meets this packet's AA bar. The light palette is not inferred from dark fixtures.
- Red-first audit fixtures must reject a wrong path, unscoped/light selector, an extra rule, a layout token, an unknown token, missing/duplicate colour override, and a changed light palette. They must accept the scoped complete dark counterpart. Existing audit fixtures remain green. The CLI audit must pass with the actual new stylesheet, not only a synthetic fixture.
- The scope extension is not permission to weaken tests or change the approved colour treatment. If original approval evidence for a specific value cannot be recovered, report that value as unverified and pause that affected implementation, rather than inventing approval or a new default.

## 5. Tests first (red on today's code)
- The provider defaults to light with no stored choice.
- A stored `dark` applies the `dark` class on mount.
- Toggling writes `sw-theme`.
- A throwing `localStorage` falls back to light without an error.
- The More menu shows the Appearance control as a ghost control.
- `goalDark.css` redefines every `g-*` colour token that `index.css` defines (parse both files, compare the sets).

## 6. Definition of done
- [ ] Red first, then green.
- [ ] `pnpm check`, the focused tests and `pnpm build` pass.
- [ ] `node scripts/design-token-audit.mjs` passes.
- [ ] The token table and both-mode captures are on the pull request.
- [ ] Light captures are pixel-identical to `main`.
- [ ] Required CI is green, and the row is set to `done`.

## 7. Stop and ask if
A value needed to pass AA would visibly change the light palette, or the owner's captures contradict a token here. Ask the owner with the two captures side by side.

## Status
