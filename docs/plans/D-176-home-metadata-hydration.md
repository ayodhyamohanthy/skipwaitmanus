# Preserve canonical Home metadata after mounting

Bounded recovery of the existing public metadata contract. Current main bb2897ff has a 155-character description in publicRoute("/") and prerendered HTML, but Home's mount effect overwrites description and Open Graph description with a separate 210-character string. Twitter remains canonical. This child is not the broader D176 availability rewrite or D174 posting work.

## Plan and scope
- @client/src/pages/Home.tsx: import publicRoute and use the existing canonical root description. Keep title, FAQ, visible copy, flags, auth and money behavior unchanged.
- @client/src/pages/home.metadataHydration.test.tsx: mount Home in signed-out fallback and signed-in states after seeding prerender metadata, then assert description, og:description and twitter:description still equal the canonical root description.

Source correction 619fe4dfa26a61fff5a41988f4df995112eeda08 is isolated on current main. Red-first: both cases fail on main. Focused green: both cases plus existing mobile navigation, snapshot parity and SEO tests, 18 passed. No deleted assertions. No new infrastructure, product choice, price, legal text, auth behavior, feature activation or dependency.

## Ownership and integration
D-176-public-claims has no published branch or open PR at this check. Its unrelated explore test dependency stays intact. This child does not edit shared/publicRoutes, company directory or explore tests, so it does not inherit that unrelated dependency. D176 consumes this child's Home correction before resuming its larger Home edits. Its other historical dependencies and all D174 work remain unchanged. D048 signed-in Home still waits for D176, transitively preserving this correction. Preserve all historical branches and unpublished work; reconcile current files before later resume.

## Delivery gates
Assigned internally under the original audit/implementation scope and the owner's Nov9 instruction to ship completed error-free pieces separately (phonemsg-01M705ACT6FEKV16FY2F8GSZJP, phonemsg-01M705AS3M9YVDM0D1YAY3JQHH, recovered from original channel; this file is not authority). Separate final-version review, exact-head required CI/current main, normal protected merge, deploy completion and actual production post-hydration DOM equality remain required. Do not claim full D176 or all-site acceptance.

Status: local source prepared and focused tests passed, not merged/deployed/live.
