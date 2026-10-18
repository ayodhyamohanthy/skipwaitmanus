# Packet FND-2: remove verified-dead code that misleads models

> Read `docs/BRIEF.md` first, then this packet.

| Field | Value |
|---|---|
| Queue row | §3b `FND-2` |
| Decisions | D-074; AGENTS.md "Zero unsolicited refactoring" is satisfied because this packet is the request |
| Risk tier | 3 |
| Size | S |
| Implementer | any model |
| Branch | `agent/<model>/fnd2-dead-code` |
| Depends on | D-067 live (it edits `client/src/pages/ReferralRequest.tsx`, which this packet keeps) |
| Verified against | `main` `e6b87f8`: every file below has no importer, checked by full path |

## 1. Goal
Files that nothing builds, routes or imports cost every model context, and some contradict the live design (the "Kinetic" drafts navigate to routes that do not exist). Delete them. Git history keeps them.

## 2. Delete (re-check each with `/usr/bin/grep -rn "<path without extension>"` before deleting; if anything imports it, keep it and say so in the row)
- The Kinetic drafts:
  - `client/src/components/referrer/ReferrerCockpit.tsx`
  - `client/src/components/seeker/SeekerSearchPage.tsx`
  - `client/src/components/layout/AppShell.tsx` (not the live `client/src/components/AppShell.tsx`)
  - `client/src/pipeline/PipelineTracker.tsx`
  - `client/src/components/ui/primitives.tsx` (only the four drafts import it)
- Unused client files:
  - `client/src/hooks/useMobile.tsx`
  - `client/src/components/AccountTopBar.tsx`
  - `client/src/components/DashboardLayoutSkeleton.tsx`
  - `client/src/components/MetricCard.tsx`
  - `client/src/components/ReferralProgress.tsx`
- Unused shadcn parts: `client/src/components/ui/{button-group,chart,empty,field,form,input-group,item,kbd,navigation-menu,spinner}.tsx`
- Unused server and worker code:
  - `src/services/mailService.ts` (a duplicate ZeptoMail sender; the live one is `server/emailDelivery.ts`)
  - `server/_core/map.ts`, `server/_core/dataApi.ts`, `server/_core/imageGeneration.ts`, `server/_core/voiceTranscription.ts`, `server/_core/heartbeat.ts` (Manus template modules with no importer)
- `render.yaml` (no workflow uses it; it has no `BILLING_ENV`, so a deploy from it would not start)
- In `vite.config.ts`: the unused `import { VitePWA } ...` line only (the real service worker is the hand-written `client/public/sw.js`). Leave `tsconfig.json`'s `vite-plugin-pwa/client` types alone.

## 3. Keep (looks dead, is not)
- `client/src/styles/globals.css` is dead, but the D-048 phase-2 packet deletes it (its `--sw-*` names collide with the new tokens). Leave it to that packet.
- `client/src/pages/Notifications.tsx` is unrouted, but `server/notificationCenterUi.test.ts` reads it as text. Leave both.
- `client/src/pages/ReferralRequest.tsx` is unrouted, but D-067 keeps and edits it, and `client/src/pages/referralRequest.auth.test.tsx` imports it.
- `client/src/pages/ComponentShowcase.tsx` is DEV-only by design.
- `app/`, `screens/`, `design/`, `research/` are references, not code.

## 4. Docs (same push)
`docs/ARCHITECTURE.md` §11 item 1 (remove what you deleted); the `AGENTS.md` living map, if any row names a deleted file.

## 5. Definition of done
Gate green (`pnpm check` and `pnpm build` prove nothing imported them); row done. Tier 3.

## 6. Stop and ask if
Any deletion breaks `pnpm check`, a test or `pnpm build`. Restore that file and record why it is live.
