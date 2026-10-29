// Goal /settings > Region. Display-only preferences (queue task 25): the time
// zone and date format change how a stored timestamp is printed, never when
// anything expires. Account values win; guests keep their choice on this device.
// Formulas mirror the kit RegionPanel; its account id and copy stay unchanged.
import { useState } from "react";
import { useAuth } from "@/_core/auth";
import { GoalButton, GoalNextStep } from "@/components/goal";
import { DATE_FORMATS, type DateFormat } from "@shared/accountPreferences";
import { setDisplayPrefs, useDisplayPrefs, type DisplayPrefs } from "@/lib/displayPrefs";
import { browserPaymentRoute } from "@/lib/paymentRoute";
import { Link } from "wouter";
import { InlineError, InlineLink, Section } from "./settingsParts";

const DATE_FORMAT_LABELS: Record<DateFormat, string> = { dmy: "8 Oct 2026", mdy: "Oct 8, 2026", iso: "2026-10-08" };

// Chromium still reports a few zones by their pre-rename IANA ids.
const ZONE_ALIASES: Record<string, string> = { "Asia/Calcutta": "Asia/Kolkata", "Asia/Katmandu": "Asia/Kathmandu", "Asia/Saigon": "Asia/Ho_Chi_Minh", "Asia/Rangoon": "Asia/Yangon", "Europe/Kiev": "Europe/Kyiv" };

function deviceZone(): string {
  try { return ZONE_ALIASES[Intl.DateTimeFormat().resolvedOptions().timeZone] ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC"; } catch { return "UTC"; }
}

function gmtOffsetLabel(timeZone: string, now: Date): string {
  try { return new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(now).find(part => part.type === "timeZoneName")?.value ?? "GMT"; } catch { return "GMT"; }
}

function zoneChoices(device: string, chosen: string | null): string[] {
  let all: string[] = [];
  try { all = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? []; } catch { all = []; }
  const set = new Set(all);
  if (chosen) set.add(chosen);
  set.delete(device);
  return Array.from(set).sort();
}

const FIELD_LABEL = "block text-g-label text-g-ink";
const FIELD = "mt-2 flex min-h-11 w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-label text-g-ink";

export default function RegionSection() {
  const { isSignedIn, getToken } = useAuth();
  const prefs = useDisplayPrefs();
  const [error, setError] = useState("");
  const zone = deviceZone();
  const currency = browserPaymentRoute();
  const dateSample = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date());

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

  return (
    <>
      <GoalNextStep reason="Plans and credits are priced in the currency this device resolves to. Review the plans priced for you.">
        <GoalButton className="mt-4" variant="primary" touch="large" asChild>
          <Link href="/plans">See plans in {currency}</Link>
        </GoalButton>
      </GoalNextStep>

      <Section title="Language & region">
        <div className="mt-4 grid gap-4 gdesk:grid-cols-2">
          <div>
            <p className="text-g-label text-g-ink">Language</p>
            <p className="mt-2 flex min-h-11 items-center rounded-g-control border border-g-hairline px-3 text-g-label text-g-ink-2">English</p>
          </div>
          <label className={FIELD_LABEL}>Time zone
            <select className={FIELD} value={prefs.timeZone ?? ""} onChange={event => {
              const timeZone = event.target.value || null;
              void save({ ...prefs, timeZone }, { timeZone });
            }}>
              <option value="">{`${zone} · this device`}</option>
              {zoneChoices(zone, prefs.timeZone).map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <div>
            <p className="text-g-label text-g-ink">Currency</p>
            <p className="mt-2 flex min-h-11 items-center rounded-g-control border border-g-hairline px-3 text-g-label text-g-ink-2">{currency}</p>
          </div>
          <label className={FIELD_LABEL}>Date format
            <select className={FIELD} value={prefs.dateFormat ?? ""} onChange={event => {
              const dateFormat = DATE_FORMATS.find(format => format === event.target.value) ?? null;
              void save({ ...prefs, dateFormat }, { dateFormat });
            }}>
              <option value="">{`${dateSample} · this device`}</option>
              {DATE_FORMATS.map(format => <option key={format} value={format}>{DATE_FORMAT_LABELS[format]}</option>)}
            </select>
          </label>
        </div>
        {error ? <InlineError>{error}</InlineError> : null}
        <p className="mt-4 text-g-meta text-g-ink-2">Language and currency follow this device. Dates and times in your referral requests and alerts use this time zone and date format. Billing from another country? Switch it on <InlineLink href="/plans">Plans</InlineLink>.</p>
        <p className="mt-2 text-g-meta text-g-ink-3">This changes how dates are printed only. It never changes when anything expires or what anyone is charged.</p>
      </Section>
    </>
  );
}
