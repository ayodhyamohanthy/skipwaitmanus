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
