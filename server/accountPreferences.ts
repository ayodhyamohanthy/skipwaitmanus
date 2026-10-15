import type { Express, Request } from "express";
import express from "express";
import { DATE_FORMATS, type AccountPreferences, type DateFormat } from "../shared/accountPreferences";

export function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 64) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; } catch { return false; }
}

/** Parses a PUT body. Absent key = leave as is; null = clear (use this device). Returns an error string for bad input. */
export function parsePreferencesPatch(body: unknown): { patch: Partial<AccountPreferences> } | { error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { error: "Send the settings to change" };
  const input = body as Record<string, unknown>;
  const patch: Partial<AccountPreferences> = {};
  if ("timeZone" in input) {
    if (input.timeZone === null) patch.timeZone = null;
    else if (validTimeZone(input.timeZone)) patch.timeZone = input.timeZone;
    else return { error: "Choose a valid time zone" };
  }
  if ("dateFormat" in input) {
    if (input.dateFormat === null) patch.dateFormat = null;
    else if (typeof input.dateFormat === "string" && (DATE_FORMATS as readonly string[]).includes(input.dateFormat)) patch.dateFormat = input.dateFormat as DateFormat;
    else return { error: "Choose a valid date format" };
  }
  if (!Object.keys(patch).length) return { error: "Send the settings to change" };
  return { patch };
}

export type AccountPreferenceDeps = {
  resolveIdentity: (req: Request) => Promise<{ account: { id: number } } | undefined>;
  getPreferences: (userId: number) => Promise<AccountPreferences>;
  savePreferences: (userId: number, patch: Partial<AccountPreferences>) => Promise<AccountPreferences>;
};

export function registerAccountPreferenceRoutes(app: Express, deps: AccountPreferenceDeps) {
  app.get("/api/account/preferences", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to see your settings" });
      res.set("Cache-Control", "private, no-store");
      res.json({ preferences: await deps.getPreferences(identity.account.id) });
    } catch { res.status(500).json({ error: "We could not load your settings" }); }
  });
  app.put("/api/account/preferences", express.json({ limit: "2kb" }), async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to change your settings" });
      const parsed = parsePreferencesPatch(req.body);
      if ("error" in parsed) return res.status(400).json({ error: parsed.error });
      res.set("Cache-Control", "private, no-store");
      res.json({ preferences: await deps.savePreferences(identity.account.id, parsed.patch) });
    } catch { res.status(500).json({ error: "We could not save your settings" }); }
  });
}
