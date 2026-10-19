// Kit v4 Settings > Region: the "Language & region" Panel. Saved region
// preferences need an account preferences store that does not exist yet, so
// each field lists only what is in effect today: the one shipped language, and
// the time zone, date format and checkout currency this device resolves to.
import { useState } from "react";
import { Globe2 } from "lucide-react";
import { useAuth } from "@/_core/auth";
import { DATE_FORMATS, type DateFormat } from "../../../../shared/accountPreferences";
import { setDisplayPrefs, useDisplayPrefs, type DisplayPrefs } from "@/lib/displayPrefs";
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

const DATE_FORMAT_LABELS: Record<DateFormat, string> = { dmy: "8 Oct 2026", mdy: "Oct 8, 2026", iso: "2026-10-08" };

function zoneChoices(device: string, chosen: string | null): string[] {
  let all: string[] = [];
  try { all = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? []; } catch { all = []; }
  const set = new Set(all);
  if (chosen) set.add(chosen);
  set.delete(device);
  return Array.from(set).sort();
}

export function RegionPanel({ values = deviceRegion() }: { values?: RegionValues }) {
  const { isSignedIn, getToken } = useAuth();
  const prefs = useDisplayPrefs();
  const [error, setError] = useState("");
  const deviceZone = values.timeZone;
  const save = async (next: DisplayPrefs, patch: Partial<DisplayPrefs>) => {
    const before = prefs;
    setError("");
    setDisplayPrefs(next, !isSignedIn);
    if (!isSignedIn) return;
    try {
      const token = await getToken();
      const response = await fetch("/api/account/preferences", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(patch) });
      if (!response.ok) throw new Error("save failed");
    } catch {
      setDisplayPrefs(before, false);
      setError("We could not save that. Your previous setting is still in use.");
    }
  };
  return <Panel>
    <Globe2 className="mb-2 size-5" aria-hidden="true" />
    <h2 className="text-lg font-semibold">Language &amp; region</h2>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <RegionField label="Language" value={values.language} />
      <label className="text-sm font-medium">Time zone
        <select className={field} aria-describedby="region-footnote" value={prefs.timeZone ?? ""} onChange={event => { const timeZone = event.target.value || null; void save({ ...prefs, timeZone }, { timeZone }); }}>
          <option value="">{deviceZone} · this device</option>
          {zoneChoices(deviceZone.split(" (")[0], prefs.timeZone).map(zone => <option key={zone} value={zone}>{zone}</option>)}
        </select>
      </label>
      <RegionField label="Currency" value={values.currency} />
      <label className="text-sm font-medium">Date format
        <select className={field} aria-describedby="region-footnote" value={prefs.dateFormat ?? ""} onChange={event => { const dateFormat = (event.target.value || null) as DateFormat | null; void save({ ...prefs, dateFormat }, { dateFormat }); }}>
          <option value="">{values.dateSample} · this device</option>
          {DATE_FORMATS.map(format => <option key={format} value={format}>{DATE_FORMAT_LABELS[format]}</option>)}
        </select>
      </label>
    </div>
    {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
    <p className="mt-4 rounded-xl bg-muted p-3 text-sm">Plans and credits are priced in <strong>{values.currency}</strong> on this device. Billing from another country? Switch it on <Link href="/plans" className="font-semibold underline underline-offset-4">Plans</Link>.</p>
    <p id="region-footnote" className="mt-2 text-xs text-muted-foreground">Language and currency follow this device. Dates and times in your requests and alerts use your time zone and date format.</p>
  </Panel>;
}
