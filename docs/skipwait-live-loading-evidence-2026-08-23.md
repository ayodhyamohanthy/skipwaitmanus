# skipwait.me loading incident — independent evidence

## Observed served behavior

On 2026-08-23, direct browser navigation to `https://skipwait.me/` initially rendered a static **“Skipwait BETA Loading…”** shell. Repeated read-only probes returned HTTP 200 with `server: Caddy`, an HTML title of `Loading`, and a two-second meta refresh. The custom domain resolved to `swm.vibecode.run` (`45.63.6.39`).

## Production deployment diagnosis

The authenticated VibecodeApp deployment inventory identifies the live project as **SkipWait.me**, deployment/workspace ID `019e0270-08e6-735f-8291-5bbb2b667f58`, mapped to `skipwait.me`. Its deployment view reported that the last published release was about one day old and that unpublished workspace updates existed. The production logs repeatedly showed Bun failing to resolve the nonexistent package `@better-auth/react@^1.6.9` from the npm registry.

The active production workspace tunnel `https://bnnowltfdvdb.dev.vibecode.run/api/health` returned HTTP 502 with the same platform Loading HTML. Workspace status reported `ACTIVE`, but the production backend listener was not proxy-reachable.

## Repair boundary and status

The live-loading repair is restricted to the existing production SkipWait.me workspace, not the isolated SkipWait Sandbox. The minimum candidate correction is a no-dependency Bun listener at `backend/src/index.ts` that binds the platform-provided port and serves only `GET /api/health` with `{ "status": "ok" }`. A first Claude Haiku 4.5 task to create that exact file was independently confirmed as aborted before producing a completion or source update; it must be retried and source-reviewed before any deployment.

No Sandbox deployment, custom-domain/DNS change, payment, credential, database, webhook, storage, customer-data, or provider operation occurred during this diagnosis.

## Follow-up source and runtime evidence

The exact minimal `backend/src/index.ts` listener was created through the authenticated workspace file editor after two Claude Haiku 4.5 tasks aborted. Its independently read-back content binds `0.0.0.0` on `process.env.PORT` (falling back to `3000`) and returns `{ "status": "ok" }` only for `GET /api/health`; no deployment was made. The active tunnel still returned HTTP 502 immediately afterward.

The workspace frontend runtime logs independently show the remaining source migration failure: Vite starts on port 8000 but cannot resolve `@shared/const` from `webapp/src/main.tsx` and `webapp/src/const.ts`, cannot resolve `@shared/referralUrl` from `webapp/src/pages/Onboarding.tsx`, and reports a PostCSS/Tailwind parsing error. These errors confirm the current production workspace still contains incompatible Manus-era alias imports and cannot provide a loading application until the active UI source is repaired or replaced with the already isolated native Sandbox implementation. The direct health listener alone does not remediate the production UI.

An authenticated, read-only workspace editor API inspection subsequently showed that the editor’s current root-relative `src/main.tsx` is a simple React mount (`App` plus `index.css`) and that its current `vite.config.ts` aliases only `@` and `@server`, not `@shared`. The exact referenced legacy files returned internal errors through that editor API. This creates an unresolved discrepancy between the persisted file snapshot and the displayed Vite error history; the current `src/App.tsx` and running preview must be inspected directly before inferring the next repair.

## Listener-port correction

Backend logs then isolated a concrete startup failure: the initial listener explicitly used `process.env.PORT ?? 3000` and failed with `EADDRINUSE` on port 3000. The listener was corrected to let `Bun.serve` resolve its platform port normally. The runtime then logged **“SkipWait health listener ready on 0.0.0.0:3000”** without a startup exception. The active workspace tunnel nevertheless continued to return the platform’s HTTP 502 Loading HTML after a recovery wait, so the development proxy remains independently unhealthy even with the listener bound.

The current editor snapshot’s root `package.json` contains a Vite 7 / React 19 frontend and `better-auth` (but no `@better-auth/react`); its `src/index.css` uses Tailwind 4’s PostCSS plugin. Current `src/App.tsx` is a small static SkipWait staging landing page. No public deployment has been attempted since the live-loading incident, and the custom domain, DNS, Sandbox deployment state, payments, credentials, database, webhooks, storage, and customer data remain unchanged.

## Explicit live publish and verification

Under the user’s explicit instruction to restore the currently served UI, the existing SkipWait.me production workspace was published once. VibecodeApp reported **“Deployment succeeded”**, and its deployment dashboard lists the new release as published just now with 13 updates and says it is up to date with the dev version. The action did not change DNS, payment, credentials, webhooks, database content, customer data, or the isolated Sandbox.

However, direct fresh navigation to `https://skipwait.me/` after the successful deployment still rendered the legacy **“Skipwait BETA Loading…”** shell. A no-cache fetch of the custom-domain URL returned HTTP 502 from Caddy, while the document’s loaded assets remained the older Clerk/tRPC bundle. The deployment dashboard also remained on **“Loading your domain…”**. Therefore the live-loading incident is **not yet resolved** and the successful publish must not be treated as proof that the domain routing or runtime is healthy.

## Final recovery verification

After deployment propagation, both `https://swm.vibecode.run/api/health` and `https://skipwait.me/api/health` returned HTTP 200 with the health JSON. The deployment dashboard subsequently reported the custom domain as **live**. A fresh browser navigation initially displayed the legacy loader while Clerk initialized; independent inspection then confirmed `window.Clerk.loaded === true`, no active session, and a rendered sign-up/sign-in UI. A follow-up visual browser check at `https://skipwait.me/login?next=/inbox` showed the usable **Create account / Sign in** shell rather than the persistent loading screen.

The live loading incident is therefore resolved. This proves only served public and account-entry UI availability, not full migration parity, authenticated workflow acceptance, payment behavior, or any Sandbox cutover gate. Those remain open and isolated.

## Recurrence observed on 24 August 2026

On 24 August 2026, the user reported that `skipwait.me` was again taking indefinitely to load. Fresh read-only checks confirmed the recurrence: both `https://skipwait.me/api/health` and `https://swm.vibecode.run/api/health` returned HTTP 200 with `{"status":"ok"}`, while both root URLs returned only `Loading`. A visual browser inspection of `https://skipwait.me/` showed the dark static three-dot loading canvas with document title `Loading`, no usable application controls, and no client-console output.

Direct DOM inspection showed that this was a static HTML loading shell rather than an active application render: the response body contained only the pixel-wave canvas, three loading dots, and inline animation code. Read-only HTTP headers for both root URLs matched: `200`, `server: Caddy`, `content-length: 6610`, ETag `"dk2u3vo8snwg53m"`, and `last-modified: Sun, 19 Jul 2026 20:36:16 GMT`. The narrow health listener remains reachable, but the frontend deployment/routing path is again serving the stale static loader. No production workspace change, Sandbox deployment, DNS/domain action, provider/payment operation, credential use, storage action, delivery action, or customer-data operation was performed during diagnosis.

Recovery is currently blocked on access to the existing Vibecode production workspace because the browser session reset and now presents Vibecode account login. The user has been asked to sign in in the open Vibecode login window. Any future remediation must remain limited to the existing production workspace, must not publish or bind the isolated Sandbox, and must be directly source- and runtime-verified before declaring the public UI restored.

## Authenticated production-workspace inspection after recurrence

The user then restored access to the existing production Vibecode workspace `019e0270-08e6-735f-8291-5bbb2b667f58`. The visible model selector was changed from Claude Opus 5 to the required **Claude Haiku 4.5** before any new task. Direct root-source inspection found a compact React/Vite fallback app: `index.html` mounts `/src/main.tsx`; that module mounts `src/App.tsx`; the root `package.json` provides `vite` scripts; `vite.config.ts` resolves only `@` and `@server`; and `postcss.config.js` uses Tailwind 4’s `@tailwindcss/postcss` plugin. The root `App.tsx` is a small static Skipwait staging landing screen, not the live mobile-referral application.

The production workspace’s **Frontend** logs, however, show that the live Vite process runs from `/home/user/workspace/webapp`, not the root fallback. That active process fails before rendering due to unresolved legacy Manus imports: `@shared/const` from `webapp/src/main.tsx` and `webapp/src/const.ts`, and `@shared/referralUrl` from `webapp/src/pages/Onboarding.tsx`. It also reports a PostCSS error treating `tailwindcss/lib/index.js` as CSS. These runtime logs directly account for the public Loading shell. The authenticated workspace file-inventory endpoint confirms that the persisted editor tree exposes only `webapp/server.log`, whereas the Vite logs reference a larger `/webapp/src` tree; the active webapp source is therefore unavailable through the current persisted-file view and cannot be safely edited by inference.

No file was changed, no command was executed in the production workspace, and no deployment, domain/DNS, payment, provider, storage, delivery, credential, customer-data, or Sandbox operation occurred during this inspection. The live recovery must address the actual active `/webapp` source or its deployment configuration; changing the root fallback app alone would not be evidenced as a fix for the served frontend.

## User-authorized deployment attempt and independent result

The user explicitly approved a narrow production recovery: deploy only the existing root landing UI, with no Sandbox publication, domain/DNS change, authentication, payment, provider, storage, credential, or customer-data operation. The existing production workspace’s Deploy control reported **Deployment succeeded**. Direct deployment metadata and production logs show what was actually created: deployment `a9033154-eeb2-462a-922e-28f55cc6b347` is `type: BACKEND`, `backendStatus: DEPLOYED`, and `frontendStatus: null`. The production log contains only the Bun health listener startup and no frontend build stage.

Independent public verification did **not** support a recovery claim. Immediately after the platform success message, `skipwait.me` visibly transitioned from its static Loading shell to HTTP 502 in Chromium. Fresh read-only extraction subsequently still returned `Loading` at both `https://skipwait.me/` and `https://swm.vibecode.run/`, while `https://skipwait.me/api/health` returned `{"status":"ok"}`. The deployment therefore restored only the backend health listener; it did not produce or attach a frontend artifact. The source/publish boundary remains unresolved and the public UI is still unavailable. No additional deployment, code edit, domain/DNS, provider, payment, storage, credential, customer-data, delivery, or Sandbox action was made after this verification.

## Read-only public-host recheck after the latest release

On 24 August 2026 at approximately 18:34 UTC, direct read-only HTTP checks returned HTTP 200 for both `https://skipwait.me/` and `https://swm.vibecode.run/`, but each served the same static Caddy document (`content-length: 6610`, ETag `"dk2u3vo8snwg53m"`, `last-modified: Sun, 19 Jul 2026 20:36:16 GMT`). `https://skipwait.me/api/health` independently returned HTTP 200 JSON. This confirms the public root remains attached to the old static frontend despite the backend health endpoint being reachable. An authenticated Vibecode workspace reload then stalled on its loading skeleton before the deployment-log panel could be reached, so no new build-log evidence was obtained. No production setting, deployment, code, domain/DNS, payment, provider, storage, credential, customer-data, delivery, or Sandbox action was performed during this recheck.
