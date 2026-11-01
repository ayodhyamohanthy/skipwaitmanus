// Common long and short names for directory companies, keyed by directory slug
// (D-174 company search). Static on purpose: no table, no migration. A company
// with no other common name is absent.
export const COMPANY_NAME_ALIASES: Readonly<Record<string, readonly string[]>> = {
  tcs: ["Tata Consultancy Services", "Tata Consultancy", "Tata"],
  "go-neutrinos": ["Go Neutrinos", "GoNeutrinos"],
  skipwait: ["SkipWait", "Skip Wait"],
};
