# Referrer consistency visual findings

## Mobile: 375x812

The signed-out Referrer entry uses the shared fixed-height shell, a conventional Back link at the top left, a single centered verification title, concise personal-email guidance, one email field, and one full-width Send code action. No wordmark or logo competes with the flow. The content fits within one viewport without page scrolling.

## Desktop: 1280x720

The same hierarchy remains centered within a constrained content width. The Back control stays aligned to the shell’s left edge while the verification content remains visually focused. The responsive layout does not introduce extra navigation or competing actions.

## Audit conclusion

The updated shell is consistent for the visible signed-out entry state. Authenticated inbox, empty, loading, decision, and claimed-request review states were aligned in code to the same h-dvh shell, Back navigation pattern, rounded card treatment, and controlled internal scrolling. Regression and production-build validation remain required before checkpointing.
