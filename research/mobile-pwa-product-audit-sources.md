# Mobile PWA Product Audit Sources

This source note records external guidance reviewed for the skipwait.me mobile-PWA improvement pass.

## Principles selected for implementation

| Principle | Practical implication for skipwait.me | Source |
| --- | --- | --- |
| Focus an installed PWA on its highest-priority task and reduce clutter. | Preserve one primary action per step, keep public navigation behind the hamburger menu on mobile, and avoid promotional copy in task flows. | [1] |
| Provide deep links, responsive layouts, semantic controls, and offline continuity. | Retain route-level URLs, maintain the existing responsive views and offline draft notice, and add targeted PWA polish rather than introducing new friction. | [2] |
| Mobile forms require visible labels, appropriate input modes, 16px-or-larger controls, nearby errors, logical order, and 48px targets. | Refine job-link and company-email controls with keyboard hints and mobile-friendly attributes; keep errors adjacent to the field and primary action. | [3] |
| Mobile navigation should be minimal, consistent, clearly labeled, and place central content before secondary material. | Use the newly introduced compact menu on public mobile entry; retain clear Back exits in task flows. | [4] |
| Standalone PWAs benefit from safe-area awareness, display-mode-aware polish, and controlled overscroll. | Add manifest and document metadata improvements plus safe-area/overscroll defaults where they reduce accidental browser behavior without blocking content. | [1] [2] |

## Current audit observations

The current core flows already use fixed mobile viewports, a single primary action, an offline notice, route-level deep links, and a standalone manifest. The audit identified three cohesive improvements to implement next: mobile keyboard/auto-capitalization hints for the URL and work-email fields; standards-aligned installed-PWA metadata and safe-area handling; and consistent task-route headers on public-but-task-focused pages such as credits and plans.

## References

[1]: https://web.dev/learn/pwa/app-design "web.dev: App design"
[2]: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Best_practices "MDN: Best practices for PWAs"
[3]: https://web.dev/learn/forms/design-basics "web.dev: Form design basics"
[4]: https://www.w3.org/TR/mobile-bp/ "W3C: Mobile Web Best Practices"
