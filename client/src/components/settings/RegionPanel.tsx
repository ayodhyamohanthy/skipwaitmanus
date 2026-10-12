// Kit v4 Settings > Region: the "Language & region" Panel. Saved region
// preferences need an account preferences store that does not exist yet, so
// each field lists only what is in effect today: the one shipped language, and
// the time zone, date format and checkout currency this device resolves to.
import { Globe2 } from "lucide-react";
import { Link } from "wouter";
import { Panel, field } from "@/components/kit/preview-kit";
import { browserPaymentRoute, type PaymentRoute } from "@/lib/paymentRoute";

export type RegionValues = { language: string; timeZone: string; currency: PaymentRoute; dateSample: string };

/** "GMT+5:30" for the given zone at `now`; plain "GMT" at zero offset. */
export function gmtOffsetLabel(timeZone: string, now: Date): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(now).find(item => item.type === "timeZoneName");
    return part?.value ?? "GMT";
  } catch {
    return "GMT";
  }
}

// Chromium still reports a few zones by their pre-rename IANA ids.
const ZONE_ALIASES: Record<string, string> = { "Asia/Calcutta": "Asia/Kolkata", "Asia/Katmandu": "Asia/Kathmandu", "Asia/Saigon": "Asia/Ho_Chi_Minh", "Asia/Rangoon": "Asia/Yangon", "Europe/Kiev": "Europe/Kyiv" };

export function deviceRegion(now: Date = new Date()): RegionValues {
  let timeZone = "UTC";
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { /* keep UTC */ }
  timeZone = ZONE_ALIASES[timeZone] ?? timeZone;
  return {
    language: "English",
    timeZone: `${timeZone} (${gmtOffsetLabel(timeZone, now)})`,
    currency: browserPaymentRoute(),
    // Dates across SkipWait use the device locale's short-month format.
    dateSample: new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(now),
  };
}

function RegionField({ label, value }: { label: string; value: string }) {
  return <label className="text-sm font-medium">{label}<select className={field} aria-describedby="region-footnote" defaultValue={value}><option value={value}>{value}</option></select></label>;
}

export function RegionPanel({ values = deviceRegion() }: { values?: RegionValues }) {
  return <Panel>
    <Globe2 className="mb-2 size-5" aria-hidden="true" />
    <h2 className="text-lg font-semibold">Language &amp; region</h2>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <RegionField label="Language" value={values.language} />
      <RegionField label="Time zone" value={values.timeZone} />
      <RegionField label="Currency" value={values.currency} />
      <RegionField label="Date format" value={values.dateSample} />
    </div>
    <p className="mt-4 rounded-xl bg-muted p-3 text-sm">Plans and credits are priced in <strong>{values.currency}</strong> on this device. Billing from another country? Switch it on <Link href="/plans" className="font-semibold underline underline-offset-4">Plans</Link>.</p>
    <p id="region-footnote" className="mt-2 text-xs text-muted-foreground">Language, time zone and date format follow this device. Ask expiry and message times show in your time zone.</p>
  </Panel>;
}
