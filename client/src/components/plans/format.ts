// Kit v4 dates read "6 Nov 2026" (day month year) on plans and billing.
export function kitDate(value: string | Date, withYear = true): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // en-US short months ("Sep", never "Sept"), arranged day-first as the kit prints them.
  const parts = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(entry => entry.type === type)?.value ?? "";
  return withYear ? `${part("day")} ${part("month")} ${part("year")}` : `${part("day")} ${part("month")}`;
}

/** Free allowances reset when the UTC calendar month changes (server currentMonthlyCycleKey). */
export function nextFreeReset(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** Minor units → "$7" / "₹599" / "$7.50", matching the kit's whole-amount receipts. */
export function money(amountMinor: number, currency: string): string {
  const whole = amountMinor % 100 === 0;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(whole ? 0 : 2)} ${currency}`;
  }
}
