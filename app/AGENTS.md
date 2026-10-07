<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## App architecture
- Keep the public launch homepage at / without app navigation, and company discovery at /explore; wrap other design screens in the shared sidebar/mobile-tab shell so the public website and app have distinct navigation.
- Give each major design screen its own TanStack leaf route and metadata so it can be reviewed and shared independently.
- Keep design screens disconnected from Cloud services because the current user scope is presentation-only; do not introduce fake marketplace inventory.
- Define all visual roles and responsive app treatments in the global semantic-token design system so mobile and desktop share one brand.
- Reuse VisualJourney for seeker and referrer step explanations; a shared touchable sequence keeps homepage and app guidance consistent without fabricated activity.
- Keep account entry on the standalone /sign-in design route; one consistent destination makes the public-to-app journey easy to understand without connecting backend services.
- Keep marketplace demonstration data in one typed client-safe module and label illustrative activity as preview content; centralized honest data prevents fabricated live-state claims.
- Keep internal operations in a visually distinct standalone admin shell; this prevents privileged workflows from being confused with seeker and referrer navigation.
- Keep pricing, credit and work-showcase preview data in one client-safe monetization data module; one source keeps example pricing consistent across plans, wallet and company pages.
- Keep the company sales page standalone like the homepage; employers are a separate audience from seekers and referrers.
- Group secondary account, employer and design-admin destinations in the shared shell's accessible More menu so primary referral navigation stays focused.

- Keep LLM handoff docs in docs/handoff/ updated in the same change as any design change; they are the source for exported ZIP/PDF deliverables.
