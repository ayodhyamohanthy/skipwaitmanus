import { z } from "zod";

/** Changeable per-purchase limit; callers refuse to quote an over-limit list. */
export const GROUP_RECIPIENT_LIMIT = 500;

const recipientEmailSchema = z.email().max(254).refine(email => email === email.toLowerCase());
const invalidRecipientSchema = z.strictObject({
  entry: z.number().int().positive(),
  value: z.string().max(120),
  reason: z.enum(["not_an_email", "too_long"]),
}).readonly();
const duplicateRecipientSchema = z.strictObject({
  entry: z.number().int().positive(),
  value: recipientEmailSchema,
  firstEntry: z.number().int().positive(),
}).readonly();

/** Paste diagnostics only: no account existence, identity or entitlement fields. */
export const recipientListResultSchema = z.strictObject({
  valid: z.array(recipientEmailSchema).readonly(),
  invalid: z.array(invalidRecipientSchema).readonly(),
  duplicates: z.array(duplicateRecipientSchema).readonly(),
  overLimit: z.boolean(),
  entries: z.number().int().nonnegative(),
}).readonly();
export type RecipientListResult = z.infer<typeof recipientListResultSchema>;

function recipientAddress(value: string): string {
  const unquoted = value.replace(/^(["'])(.*)\1$/, "$2").trim();
  const displayName = /^[^<>]*<([^<>]*)>$/.exec(unquoted);
  return (displayName?.[1] ?? unquoted).trim().toLowerCase();
}

/** Pure, deterministic list parsing; all unique valid addresses survive overflow. */
export function parseRecipientList(text: string): RecipientListResult {
  const valid: string[] = [];
  const invalid: z.infer<typeof invalidRecipientSchema>[] = [];
  const duplicates: z.infer<typeof duplicateRecipientSchema>[] = [];
  const firstEntries = new Map<string, number>();
  let entries = 0;

  for (const piece of text.split(/[\r\n,;\t]+/)) {
    const value = piece.trim();
    if (value.length === 0) continue;
    entries += 1;
    const address = recipientAddress(value);

    if (address.length > 254) {
      invalid.push({ entry: entries, value: value.slice(0, 120), reason: "too_long" });
      continue;
    }
    if (!recipientEmailSchema.safeParse(address).success) {
      invalid.push({ entry: entries, value: value.slice(0, 120), reason: "not_an_email" });
      continue;
    }

    const firstEntry = firstEntries.get(address);
    if (firstEntry !== undefined) {
      duplicates.push({ entry: entries, value: address, firstEntry });
    } else {
      firstEntries.set(address, entries);
      valid.push(address);
    }
  }

  return recipientListResultSchema.parse({
    valid, invalid, duplicates, entries,
    overLimit: valid.length > GROUP_RECIPIENT_LIMIT,
  });
}
