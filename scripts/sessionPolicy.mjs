/**
 * D-370 (owner, Nov 20 2026): "remove review dependency" and "remove model dependency".
 * Green required CI alone lands every pull request, and no picker or CI rule reads a session's
 * model name. Both rules are off. SKIPWAIT_LEGACY_REVIEW_RULES=on turns the pre-D-370 rules back on;
 * only the test run sets it (vitest.config.ts), so the switched-off code path keeps its tests.
 * Turning it on anywhere else needs the owner's word.
 */
const legacy = globalThis.process?.env?.SKIPWAIT_LEGACY_REVIEW_RULES === "on";
export const INDEPENDENT_REVIEW_REQUIRED = legacy;
export const MODEL_ROUTES_ENFORCED = legacy;
export const NO_REVIEW_NOTICE = "review-gate: no independent review is required (D-370, owner Nov 20 2026); green required CI lands this pull request.";
