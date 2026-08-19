# Custom-domain routing diagnosis

On 19 August 2026, `https://skipwait.me` returned a legacy static deployment served by Caddy (last modified 29 July 2026) and rendered a distinct “Skipwait Beta” loading screen. It is not serving the current Manus project.

The current referral application is deployed through this project’s managed domain, `https://bridgeref-ybuthfmw.manus.space`, where it identifies as “skipwait.me — Job Referrals.” The persistent Wellfound fallback reported from `skipwait.me` therefore originates from the separate legacy deployment, not the current project code.

The remediation is to bind `skipwait.me` to this project through the project’s domain settings or update the existing DNS/proxy configuration to point to the managed deployment. Code changes in this project cannot update the unrelated Caddy-hosted site until that domain routing is changed.
