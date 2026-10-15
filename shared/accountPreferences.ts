// Per-account display preferences (queue task 25). Display only: they change how a stored timestamp is printed,
// never when anything expires or what anyone is charged. Null means "use this device".
export const DATE_FORMATS = ["dmy", "mdy", "iso"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
export type AccountPreferences = { timeZone: string | null; dateFormat: DateFormat | null };
