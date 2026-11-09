// D-048-p3-admin-money (D-048-admin.md §3): the money-ops doors and the one
// goal line. Admin goals are operational; density stays functional.
export const MONEY_DOORS = [
  { href: "/admin/payments", label: "Payment reviews" },
  { href: "/admin/catalog-sync", label: "Catalog sync" },
  { href: "/admin/token-recovery", label: "Token recovery" },
] as const;

export type MoneyDoor = (typeof MONEY_DOORS)[number]["href"];

/** One goal line for the whole money-ops cluster (packet §3 design note). */
export const MONEY_GOAL_LINE = "Keep the money truthful.";

export const MONEY_PAGE_BODY: Record<MoneyDoor, string> = {
  "/admin/payments": "The flagged discrepancy comes first. Every decision keeps its server call, its confirm step and its audit trail.",
  "/admin/catalog-sync": "Read the dry run, then apply the same plan by typing the site. Nothing is changed until you confirm.",
  "/admin/token-recovery": "Resolve a real payment or support case with a reasoned, audited grant. A support reference and your confirmation are required.",
};

// Catalog dry-run count keys arrive as the server's field names; the admin
// reads plain words (design-review finding 3, 2026-11-05).
export const CATALOG_COUNT_LABELS: Record<string, string> = {
  desired: "Desired in the catalog",
  correct: "Matching the sold catalog",
  mismatched: "Not matching the sold catalog",
  blocked: "Blocked from syncing",
  toCreate: "To create",
  itemPricesToCreate: "Item prices to create",
  extras: "On the site but not for sale",
  excluded: "Excluded from the sync",
};

export function catalogCountLabel(key: string): string {
  if (CATALOG_COUNT_LABELS[key]) return CATALOG_COUNT_LABELS[key];
  // Unknown key: split camelCase into words rather than show the raw name.
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, ch => ch.toUpperCase());
}
