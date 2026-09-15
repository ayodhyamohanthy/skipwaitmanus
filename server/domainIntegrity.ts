import { domainToASCII } from "node:url";
import { isIP } from "node:net";
import { parse } from "tldts";

export type DomainClassification = "valid_registrable_domain" | "public_suffix_only" | "malformed_ip_localhost" | "valid_but_not_canonical";
export type StoredDomainRow = { table: string; rowId: string | number; storedDomain: string; evidenceOnly?: boolean };
export type DomainIntegrityRow = StoredDomainRow & { classification: DomainClassification; suggestedDomain?: string };

export function classifyStoredDomain(value: string): { classification: DomainClassification; suggestedDomain?: string } {
  const stored = String(value ?? "");
  const trimmed = stored.trim();
  const ascii = domainToASCII(trimmed.replace(/\.$/, "")).toLowerCase();
  if (!ascii || ascii === "localhost" || isIP(ascii) !== 0 || /[\s\/:@?#]/.test(trimmed)) return { classification: "malformed_ip_localhost" };
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(ascii)) return { classification: "malformed_ip_localhost" };
  const parsed = parse(ascii, { allowPrivateDomains: false, detectIp: true });
  const domain = parsed.domain;
  if (!domain) return parsed.isIcann && parsed.publicSuffix === ascii ? { classification: "public_suffix_only" } : { classification: "malformed_ip_localhost" };
  if (stored !== domain) return { classification: "valid_but_not_canonical", suggestedDomain: domain };
  return { classification: "valid_registrable_domain" };
}

export function buildDomainIntegrityReport(input: StoredDomainRow[], limit = 100) {
  const rows = input.map(row => ({ ...row, ...classifyStoredDomain(row.storedDomain) }));
  const aggregate = () => ({ valid_registrable_domain: 0, public_suffix_only: 0, malformed_ip_localhost: 0, valid_but_not_canonical: 0 });
  const aggregates = aggregate(); const evidenceAggregates = aggregate();
  for (const row of rows) (row.evidenceOnly ? evidenceAggregates : aggregates)[row.classification]++;
  const affected = rows.filter(row => !row.evidenceOnly && row.classification !== "valid_registrable_domain");
  const evidence = rows.filter(row => row.evidenceOnly && row.classification !== "valid_registrable_domain");
  return { affectedCount: affected.length, aggregates, affectedRows: affected.slice(0, Math.max(1, Math.min(limit, 200))), evidence: { aggregates: evidenceAggregates, affectedCount: evidence.length, affectedRows: evidence.slice(0, Math.max(1, Math.min(limit, 200))) } };
}
