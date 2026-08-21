# Slack and Linear Private Triage Audit

## Scope and product boundary

Skipwait.me may notify a Referrer that a **private referral review is ready** only after a verified exact-company routing event. The notification must not identify a candidate, expose a resume, disclose a queue or capacity count, imply that a specific employee viewed a profile, or promise an introduction, interview, or job outcome. A decision is recorded only after the recipient completes the existing authenticated, single-use review-link flow using their verified work email.

## Verified delivery paths

| Destination | Supported capability | Safe use for skipwait.me | Current availability |
|---|---|---|---|
| Email | Existing Resend sender plus authenticated, single-use review links | Send a minimal company-level review-ready notice with accept/decline links that still require verified work-email authentication | Implemented and verified |
| Slack | Incoming webhooks can post JSON Block Kit messages; interactive actions require a Slack app interaction callback URL | Optional opt-in channel posting that contains a company-level review-ready notice and opens the authenticated review link; direct Slack action callbacks require a separately configured, verified Slack app and signing-secret receiver | Slack connector exists but is disabled; no webhook or app credential is configured |
| Linear | GraphQL API supports integrations; Linear webhooks are **inbound** notifications from Linear to the application | Not suitable as a push destination through its webhook system. A future opt-in Linear delivery would need an authorized GraphQL API integration and an explicitly designed issue workflow; it must not create public candidate tickets by default | Linear connector exists but is disabled; no API credential or project workflow is configured |

## Event-copy contract

| Verified event | Allowed copy | Prohibited copy |
|---|---|---|
| Exact-company capacity allocation | “A verified employee can now review your private request at {company}.” | “1 of 3 spots,” rank, countdown, or scarcity language |
| Referrer review email preparation | “A private referral review is ready at {company}.” | Candidate name, resume excerpt, profile detail, hiring guarantee, or employee seniority |
| Referrer opens authenticated review link | “Your private review is ready.” | “You reviewed the candidate profile” unless a server-side review event is separately recorded and disclosed appropriately |

## Required future setup

An external triage channel must be explicitly enabled by its owner. Slack requires a configured Slack app, an incoming-webhook destination or OAuth installation, and—if native interactive buttons are desired—a public signed interaction callback endpoint. Linear requires an authorized GraphQL integration and an approved private workflow; its webhooks do not deliver outbound messages. Both integrations must remain opt-in, failure-isolated, and auditable.

## References

[1] [Slack, Sending messages using incoming webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks)

[2] [Slack, Interactivity overview](https://docs.slack.dev/interactivity/)

[3] [Linear, API and Webhooks](https://linear.app/docs/api-and-webhooks)

[4] [Linear, Webhooks](https://linear.app/developers/webhooks)
