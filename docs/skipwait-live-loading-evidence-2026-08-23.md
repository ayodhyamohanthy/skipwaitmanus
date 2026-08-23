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
