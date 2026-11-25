// Shared copy helpers for the admin goal pages (D-048-p3-admin).
import type { CaseKind } from "@/components/admin/reviewCases";

export type AdminReviewTab = "all" | "reports" | "verifications" | "companies";

export const ADMIN_REVIEW_TABS: readonly (readonly [AdminReviewTab, string])[] = [["all", "All"], ["reports", "Reports"], ["verifications", "Verifications"], ["companies", "Companies"]];

const TAB_BY_KIND: Record<CaseKind, Exclude<AdminReviewTab, "all">> = { report: "reports", verification: "verifications", company: "companies" };
export const adminTabFor = (kind: CaseKind) => TAB_BY_KIND[kind];
export const isAdminReviewTab = (value: string | null): value is AdminReviewTab => ADMIN_REVIEW_TABS.some(([id]) => id === value);

export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
