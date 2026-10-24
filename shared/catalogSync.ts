// Contract for the admin-only Chargebee catalog sync (D-069).
//
// A dry run is a pure classification of the configured site against the sold
// catalog; the owner reads it, then triggers one apply of the same plan (pinned
// by its hash). Nothing here can update, archive or delete a provider object,
// and nothing here touches subscriptions, customers or payments.
import { z } from "zod";

const ID_PATTERN = /^[A-Za-z0-9_.@-]+$/;
const idSchema = z.string().min(1).max(100).regex(ID_PATTERN);
const planHashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const currencySchema = z.enum(["INR", "USD"]);
const termSchema = z.enum(["one_time", "monthly", "30d", "90d", "yearly"]);
const environmentSchema = z.enum(["test", "live"]);
const kindSchema = z.enum(["item_family", "item", "item_price"]);
const checkedAtSchema = z.string().refine(value => !Number.isNaN(Date.parse(value)), { message: "checkedAt must be an ISO timestamp" });

export const catalogSyncDiffSchema = z.strictObject({
  field: z.string().min(1),
  expected: z.union([z.string(), z.number(), z.null()]),
  actual: z.union([z.string(), z.number(), z.null()]),
});
export type CatalogSyncDiff = z.infer<typeof catalogSyncDiffSchema>;

export const itemPriceSpecSchema = z
  .strictObject({
    id: idSchema,
    name: idSchema,
    itemId: idSchema,
    itemType: z.enum(["plan", "addon", "charge"]),
    pricingModel: z.enum(["flat_fee", "per_unit"]),
    price: z.number().int().nonnegative(),
    currencyCode: currencySchema,
    externalName: z.string().min(1).max(140),
    period: z.number().int().positive().nullable(),
    periodUnit: z.enum(["month", "year"]).nullable(),
    billingCycles: z.number().int().positive().nullable(),
  })
  .superRefine((spec, ctx) => {
    if (spec.itemType === "charge") {
      if (spec.pricingModel !== "per_unit") {
        ctx.addIssue({ code: "custom", path: ["pricingModel"], message: "A charge item price is per_unit." });
      }
      if (spec.period !== null || spec.periodUnit !== null) {
        ctx.addIssue({ code: "custom", path: ["period"], message: "A charge item price has no billing period." });
      }
      if (spec.billingCycles !== null) {
        ctx.addIssue({ code: "custom", path: ["billingCycles"], message: "A charge item price has no billing cycles." });
      }
      return;
    }
    if (spec.pricingModel !== "flat_fee") {
      ctx.addIssue({ code: "custom", path: ["pricingModel"], message: "A plan or addon item price is flat_fee." });
    }
    if (spec.period === null || spec.periodUnit === null) {
      ctx.addIssue({ code: "custom", path: ["period"], message: "A plan or addon item price needs its billing period." });
    }
  });
export type ItemPriceSpec = z.infer<typeof itemPriceSpecSchema>;

const familyActionSchema = z.strictObject({
  kind: z.literal("item_family"),
  params: z.strictObject({ id: idSchema, name: z.string().min(1).max(100) }),
});

const itemActionSchema = z.strictObject({
  kind: z.literal("item"),
  params: z.strictObject({
    id: idSchema,
    name: idSchema,
    type: z.enum(["plan", "addon", "charge"]),
    itemFamilyId: idSchema.nullable(),
    externalName: z.string().min(1).max(140),
    enabledInPortal: z.boolean().nullable(),
  }),
});

const itemPriceActionSchema = z.strictObject({
  kind: z.literal("item_price"),
  params: itemPriceSpecSchema,
});

export const catalogSyncActionSchema = z.discriminatedUnion("kind", [familyActionSchema, itemActionSchema, itemPriceActionSchema]);
export type CatalogSyncAction = z.infer<typeof catalogSyncActionSchema>;

const familySchema = z.strictObject({
  id: idSchema.nullable(),
  action: z.enum(["reuse", "create", "none", "blocked"]),
  reason: z.string().min(1),
});

const correctSchema = z.strictObject({
  itemPriceId: idSchema,
  currencyCode: currencySchema,
  price: z.number().int().nonnegative(),
  term: termSchema,
});

const mismatchedSchema = z.strictObject({
  itemPriceId: idSchema,
  currencyCode: currencySchema,
  price: z.number().int().nonnegative(),
  term: termSchema,
  diffs: z.array(catalogSyncDiffSchema).min(1),
  sellableNow: z.boolean(),
});

const blockedSchema = z.strictObject({
  itemPriceId: idSchema,
  currencyCode: currencySchema,
  price: z.number().int().nonnegative(),
  term: termSchema,
  reason: z.string().min(1),
});

const extraSchema = z.strictObject({
  kind: kindSchema,
  id: idSchema,
  status: z.string(),
  note: z.string().min(1),
});

const excludedSchema = z.strictObject({ itemPriceId: idSchema, reason: z.string().min(1) });

export const catalogSyncDryRunSchema = z.strictObject({
  version: z.literal(1),
  site: z.string().min(1),
  environment: environmentSchema,
  checkedAt: checkedAtSchema,
  planHash: planHashSchema,
  family: familySchema,
  toCreate: z.array(catalogSyncActionSchema),
  correct: z.array(correctSchema),
  mismatched: z.array(mismatchedSchema),
  blocked: z.array(blockedSchema),
  extras: z.array(extraSchema),
  excluded: z.array(excludedSchema),
  counts: z.strictObject({
    desired: z.number().int().nonnegative(),
    correct: z.number().int().nonnegative(),
    mismatched: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    toCreate: z.number().int().nonnegative(),
    itemPricesToCreate: z.number().int().nonnegative(),
    extras: z.number().int().nonnegative(),
    excluded: z.number().int().nonnegative(),
  }),
});
export type CatalogSyncDryRun = z.infer<typeof catalogSyncDryRunSchema>;

export const catalogSyncApplyRequestSchema = z.strictObject({
  planHash: planHashSchema,
  confirmSite: z.string().min(1),
});
export type CatalogSyncApplyRequest = z.infer<typeof catalogSyncApplyRequestSchema>;

const stoppedReasonSchema = z.enum(["provider_error", "verification_mismatch", "time_budget", "audit_write_failed"]);

export const catalogSyncApplyResponseSchema = z
  .strictObject({
    outcome: z.enum(["applied", "partial", "failed", "nothing_to_do"]),
    site: z.string().min(1),
    environment: environmentSchema,
    planHash: planHashSchema,
    created: z.array(z.strictObject({ kind: kindSchema, id: idSchema, diffs: z.array(catalogSyncDiffSchema) })),
    failed: z
      .strictObject({
        kind: kindSchema,
        id: idSchema,
        httpStatus: z.number().int().nullable(),
        apiErrorCode: z.string().min(1),
        errorCode: z.string().nullable(),
        message: z.string().min(1),
      })
      .nullable(),
    notAttempted: z.array(z.strictObject({ kind: kindSchema, id: idSchema })),
    stoppedReason: stoppedReasonSchema.nullable(),
  })
  .superRefine((report, ctx) => {
    // A failed object exists exactly when the provider refused or never answered.
    if ((report.stoppedReason === "provider_error") !== (report.failed !== null)) {
      ctx.addIssue({ code: "custom", path: ["failed"], message: "A failed object belongs to a provider error." });
    }
    if (report.outcome === "applied" && (report.stoppedReason !== null || report.failed !== null || report.notAttempted.length > 0)) {
      ctx.addIssue({ code: "custom", path: ["outcome"], message: "An applied run stopped nowhere." });
    }
    if (report.outcome === "nothing_to_do" && (report.created.length > 0 || report.notAttempted.length > 0 || report.failed !== null || report.stoppedReason !== null)) {
      ctx.addIssue({ code: "custom", path: ["outcome"], message: "A nothing-to-do run changed nothing." });
    }
    if (report.outcome === "partial" && (report.stoppedReason === null || report.created.length === 0)) {
      ctx.addIssue({ code: "custom", path: ["outcome"], message: "A partial run stopped after at least one create." });
    }
    if (report.outcome === "failed" && (report.stoppedReason === null || report.created.length > 0)) {
      ctx.addIssue({ code: "custom", path: ["outcome"], message: "A failed run created nothing." });
    }
  });
export type CatalogSyncApplyResponse = z.infer<typeof catalogSyncApplyResponseSchema>;

export const catalogSyncErrorSchema = z.strictObject({
  error: z.string().min(1),
  code: z.string().min(1),
  currentHash: planHashSchema.optional(),
});
export type CatalogSyncError = z.infer<typeof catalogSyncErrorSchema>;
