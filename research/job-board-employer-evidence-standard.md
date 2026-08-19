# Job-board employer-evidence standard

Employer resolution is allowed only when evidence identifies the employer without treating a job board as the employer.

Google’s JobPosting structured-data guide shows that a job listing may expose `hiringOrganization.name` together with `hiringOrganization.sameAs`, an official organization URL. The resolver can therefore use these fields as follows:

1. A reviewed exact listing may map to an independently verified official employer domain.
2. A hosted job page may yield an employer-name candidate, but that candidate can resolve only when it exactly matches one verified employee work-email domain already known to Skipwait.
3. A `hiringOrganization.sameAs` or organization `url` may be used only when it is a non-hosted domain whose registered domain normalizes to the same employer-name candidate. The candidate and official domain must agree; a standalone arbitrary URL is insufficient.
4. Ambiguous, absent, malformed, or hosted-platform URLs remain unresolved. The service must never route to LinkedIn, Indeed, Wellfound, or another listing platform merely because the job was hosted there.

Sources reviewed on 2026-08-19: Google JobPosting structured data guidance at https://developers.google.com/search/docs/appearance/structured-data/job-posting.
