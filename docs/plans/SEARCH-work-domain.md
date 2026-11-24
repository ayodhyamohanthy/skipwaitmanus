# SEARCH-work-domain: a discovered company carries the domain its employees' work email uses (D-394)

Tier 2 · lane `search-work-domain` · branch `agent/queue/search-work-domain` · epic D-174

## Why

Owner, Nov 24 (D-394): "Fix the Google issue. Search should not map about.google when domains are
@google.com". Worldwide discovery (`server/companyDiscovery.ts`) takes a company's domain from Wikidata's
official website (P856). For Google that is `about.google`, so `GET /api/companies/search?q=google` answers
`{"name":"Google","domain":"about.google"}` and the composer says "You picked Google (about.google)". Google's
employees verify with `@google.com`. Routing still follows the pasted job link today, so no request went to the
wrong place, but the shown domain is wrong and any later use of it (job sources, referrer presence, routing)
would be.

## The build

One pure function, `workDomainFor(host)`, applied where discovery turns P856 into a domain:

1. **Verified overrides first**: a short map of hosts whose official site is not the work-email domain, starting
   with `about.google` → `google.com`. Add an entry only with evidence (the company's careers or contact page
   naming the email domain, or a verified referrer's address domain), cited in a comment.
2. **Corporate subdomains**: a host starting with `about.`, `corporate.`, `careers.`, `jobs.`, `company.`,
   `investor.`, `investors.`, `ir.` or `www.` resolves to its parent when the parent still holds a dot
   (`about.netflix.com` → `netflix.com`); a parent without a dot (a brand TLD such as `.google`) is left to the
   override map.
3. **The directory wins**: when a discovered name matches a listed company, the listed company's own domains are
   used (it is already returned under `companies`, and the discovered duplicate is dropped).

The de-duplication by domain runs on the resolved domain, so `about.google` and `google.com` are one company.

## Tests (red first)

`about.google` → `google.com`; `about.netflix.com` → `netflix.com`; `careers.example.co.uk` → `example.co.uk`;
`about.google` and `google.com` hits collapse into one result; an unknown brand-TLD host stays as it is;
`www.` is stripped as today; the live response shape is unchanged.

## Acceptance

Focused tests, `pnpm check`, required CI; then on the deployed API, `GET /api/companies/search?q=google`
returns Google with `google.com`.

## Status

- SEARCH-work-domain: todo
