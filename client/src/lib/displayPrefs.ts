// Display preferences (queue task 25): time zone and date format. Display only: they change how a stored timestamp is
// printed, never when anything expires. Account values (signed in) win over the device-local copy (guests).
import { useSyncExternalStore } from "react";
import type { AccountPreferences, DateFormat } from "../../../shared/accountPreferences";

export type DisplayPrefs = AccountPreferences;
const KEY = "sw:display-prefs";
const EMPTY: DisplayPrefs = { timeZone: null, dateFormat: null };

function readLocal(): DisplayPrefs {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "null") as Partial<DisplayPrefs> | null;
    const dateFormat = raw?.dateFormat === "dmy" || raw?.dateFormat === "mdy" || raw?.dateFormat === "iso" ? raw.dateFormat : null;
    const timeZone = typeof raw?.timeZone === "string" && validZone(raw.timeZone) ? raw.timeZone : null;
    return { timeZone, dateFormat };
  } catch { return EMPTY; }
}

export function validZone(zone: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return true; } catch { return false; }
}

let current: DisplayPrefs = readLocal();
const listeners = new Set<() => void>();

export function getDisplayPrefs(): DisplayPrefs { return current; }
export function setDisplayPrefs(next: DisplayPrefs, persistLocal = false) {
  if (next.timeZone === current.timeZone && next.dateFormat === current.dateFormat) return;
  current = { timeZone: next.timeZone, dateFormat: next.dateFormat };
  if (persistLocal) { try { globalThis.localStorage?.setItem(KEY, JSON.stringify(current)); } catch { /* storage unavailable: keep in memory */ } }
  listeners.forEach(listener => listener());
}
export function useDisplayPrefs(): DisplayPrefs {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, getDisplayPrefs, getDisplayPrefs);
}

const zoneOf = (prefs: DisplayPrefs) => prefs.timeZone ?? undefined;

/** "Oct 8" (device default), "8 Oct" (dmy), "Oct 8" (mdy) or "2026-10-08" (iso); year added when asked. */
export function formatDay(value: string | Date, options: { year?: boolean } = {}, prefs: DisplayPrefs = current): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const timeZone = zoneOf(prefs);
  if (!prefs.dateFormat) return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", ...(options.year ? { year: "numeric" } : {}), timeZone }).format(date);
  const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  if (prefs.dateFormat === "iso") {
    const iso = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(date);
    return iso;
  }
  const core = prefs.dateFormat === "dmy" ? `${get("day")} ${get("month")}` : `${get("month")} ${get("day")}`;
  return options.year ? `${core}${prefs.dateFormat === "dmy" ? " " : ", "}${get("year")}` : core;
}

export function formatTimeOfDay(value: string | Date, prefs: DisplayPrefs = current): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: zoneOf(prefs) }).format(date);
}

export function formatDayTime(value: string | Date, prefs: DisplayPrefs = current): string | null {
  const day = formatDay(value, {}, prefs), time = formatTimeOfDay(value, prefs);
  return day && time ? `${day}, ${time}` : null;
}

/** Same calendar day in the chosen (or device) time zone. */
export function isSameDay(a: string | Date, b: string | Date, prefs: DisplayPrefs = current): boolean {
  const key = (value: string | Date) => { const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: zoneOf(prefs) }).format(date); };
  const left = key(a), right = key(b);
  return left !== null && left === right;
}

export type { DateFormat };
