// Per-account display preferences (queue task 25). Display only: they change how a stored timestamp is printed,
// never when anything expires or what anyone is charged. Null means "use this device".
import type { LanguageCode } from "./languages";

export const DATE_FORMATS = ["dmy", "mdy", "iso"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
// D-093.capture (C1): language stays optional so existing consumers that build
// a full AccountPreferences object keep compiling; a required field broke five
// of them outside this row's owns.
export type AccountPreferences = { timeZone: string | null; dateFormat: DateFormat | null; language?: LanguageCode | null };
