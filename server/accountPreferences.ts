import type { Express, NextFunction, Request, Response } from "express";
import express from "express";
import { DATE_FORMATS, type AccountPreferences, type DateFormat } from "../shared/accountPreferences";
import { isVisibleLanguage, signupLanguageOf, type LanguageCode, type SignupLanguage } from "../shared/languages";
import { getAccountLanguage, recordSignupLanguage, saveAccountLanguage } from "./accountLanguage";

export function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 64) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; } catch { return false; }
}

/** Parses a PUT body. Absent key = leave as is; null = clear (use this device). Returns an error string for bad input. */
export type ParsedPreferencesPatch =
  | { patch: Partial<AccountPreferences> }
  | { patch: Partial<AccountPreferences>; language: LanguageCode | null }
  | { error: string };

export function parsePreferencesPatch(body: unknown): ParsedPreferencesPatch {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { error: "Send the settings to change" };
  const input = body as Record<string, unknown>;
  // signupLanguage is deliberately absent: it is server-owned and write-once.
  const unknown = Object.keys(input).filter(key => key !== "timeZone" && key !== "dateFormat" && key !== "language");
  if (unknown.length) return { error: "Unknown setting" };
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
  // C3: a body that only carries language is a real change. It must not fall
  // through to the empty-patch guard or call savePreferences with an empty set.
  const hasLanguage = "language" in input;
  let language: LanguageCode | null = null;
  if (hasLanguage) {
    if (input.language === null) language = null;
    else if (isVisibleLanguage(input.language)) language = input.language;
    else return { error: "Choose a language we offer" };
  }
  if (!Object.keys(patch).length && !hasLanguage) return { error: "Send the settings to change" };
  return hasLanguage ? { patch, language } : { patch };
}

export type AccountPreferenceDeps = {
  resolveIdentity: (req: Request) => Promise<{ account: { id: number } } | undefined>;
  getPreferences: (userId: number) => Promise<AccountPreferences>;
  savePreferences: (userId: number, patch: Partial<AccountPreferences>) => Promise<AccountPreferences>;
  // D-093.capture: optional so server/_core/index.ts stays untouched. The
  // defaults are the real account language module; tests inject fakes.
  getLanguage?: (userId: number) => Promise<LanguageCode | null>;
  saveLanguage?: (userId: number, code: LanguageCode | null) => Promise<void>;
  recordSignupLanguage?: (userId: number, value: SignupLanguage | null, now: Date) => Promise<boolean>;
};

export function registerAccountPreferenceRoutes(app: Express, deps: AccountPreferenceDeps) {
  const readLanguage = deps.getLanguage ?? ((userId: number) => getAccountLanguage(userId));
  const writeLanguage = deps.saveLanguage ?? ((userId: number, code: LanguageCode | null) => saveAccountLanguage(userId, code));
  const captureSignup = deps.recordSignupLanguage ?? ((userId: number, value: SignupLanguage | null, now: Date) => recordSignupLanguage(userId, value, now));

  app.get("/api/account/preferences", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to see your settings" });
      const [preferences, language] = await Promise.all([deps.getPreferences(identity.account.id), readLanguage(identity.account.id)]);
      res.set("Cache-Control", "private, no-store");
      // signupLanguage is never returned by any endpoint.
      res.json({ preferences: { ...preferences, language } });
    } catch { res.status(500).json({ error: "We could not load your settings" }); }
  });
  app.put("/api/account/preferences", express.json({ limit: "2kb" }), async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to change your settings" });
      const parsed = parsePreferencesPatch(req.body);
      if ("error" in parsed) return res.status(400).json({ error: parsed.error });
      const hasLanguage = "language" in parsed;
      // Never send an empty preferences patch to savePreferences.
      const preferences = Object.keys(parsed.patch).length
        ? await deps.savePreferences(identity.account.id, parsed.patch)
        : await deps.getPreferences(identity.account.id);
      let language: LanguageCode | null;
      if (hasLanguage) {
        language = parsed.language;
        await writeLanguage(identity.account.id, language);
      } else {
        language = await readLanguage(identity.account.id);
      }
      res.set("Cache-Control", "private, no-store");
      res.json({ preferences: { ...preferences, language } });
    } catch { res.status(500).json({ error: "We could not save your settings" }); }
  });
  app.post("/api/account/signup-language", express.json({ limit: "1kb" }), async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to record your language" });
      const value = signupLanguageOf((req.body as { language?: unknown } | undefined)?.language);
      await captureSignup(identity.account.id, value, new Date());
    } catch { /* Never turn a capture failure into a user-visible oracle. */ }
    res.status(204).end();
  });
  // A malformed or oversized body is not an account-state signal either.
  app.use("/api/account/signup-language", (_error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(204).end();
  });
}
