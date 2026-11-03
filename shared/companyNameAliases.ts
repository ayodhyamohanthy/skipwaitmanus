// Common long and short names for directory companies, keyed by directory slug
// (D-174 company search). Static on purpose: no table, no migration. A company
// with no other common name is absent.
export const COMPANY_NAME_ALIASES: Readonly<Record<string, readonly string[]>> = {
  tcs: ["Tata Consultancy Services", "Tata Consultancy", "Tata"],
  "go-neutrinos": ["Go Neutrinos", "GoNeutrinos", "Neutrinos"],
  skipwait: ["SkipWait", "Skip Wait"],
  openai: ["Open AI", "OpenAI"],
  servicenow: ["Service Now", "ServiceNow"],
  cognizant: ["CTS", "Cognizant Technology Solutions"],
  ibm: ["International Business Machines"],
  "societe-generale": ["SocGen", "Soc Gen", "Société Générale", "Societe Generale"],
  sofi: ["Social Finance", "SoFi", "So Fi"],
  ford: ["Ford Motor Company", "Ford Motors"],
  maersk: ["Moller Maersk", "A.P. Moller - Maersk", "AP Moller Maersk"],
  mongodb: ["Mongo DB", "Mongo", "MongoDB"],
  citiustech: ["Citius Tech", "CitiusTech"],
  "korn-ferry": ["Kornferry", "Korn Ferry"],
  blackrock: ["Black Rock", "BlackRock"],
  capgemini: ["Cap Gemini", "Capgemini"],
  "1password": ["1 Password", "OnePassword", "One Password"],
  hashicorp: ["Hashi Corp"],
  blackstone: ["Black Stone"],
  "bnp-paribas": ["BNP", "BNP Paribas"],
};
