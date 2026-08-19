# Wellfound employer-routing finding

The reported listing `https://wellfound.com/jobs/3971835-account-executive` identifies **ChatFin** as the hiring company in its available public content. Standard browser access and likely server-side fetching are currently guarded by Wellfound's Cloudflare verification page, so employer resolution cannot depend solely on a fresh page fetch.

The routing repair must preserve the existing safety requirement: a parsed employer name is only useful when it maps unambiguously to an already verified work-email domain. It must never route a request to `wellfound.com` or infer a non-verified employee domain.
