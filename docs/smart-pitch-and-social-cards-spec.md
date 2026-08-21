# Smart Pitch and Factual Social Cards Contract

## Purpose

These two source-app features shorten the time from private resume upload to a considered request, and let a participant voluntarily share a factual milestone. They must **increase clarity—not pressure, exposure, or implied hiring certainty**.

| Feature | User value | Required constraint |
| --- | --- | --- |
| Smart Pitch | A Job Seeker receives an editable starting draft rather than an empty note field. | The user triggers it explicitly after upload; resume processing is authorized, one-time, server-side, and not retained as a new profile or activity-log payload. |
| Social milestone card | An accepted-request participant can optionally share a simple company-level milestone. | The card is truthful, opaque, revocable, company-level, and never identifies the other participant or a hiring outcome. |

## Smart Pitch

### Private input boundary

The endpoint accepts only a signed-in Job Seeker’s own temporary attachment ID and the previously validated target-role URL. The server rechecks attachment ownership before requesting a short-lived signed read URL. The private document is sent only to the configured server-side model for that single generation; neither document text, signed URL, model response rationale, nor candidate message may be written to operational activity logs, notifications, or a public route.

PDF resumes can be analyzed directly through a short-lived file URL. Unsupported document formats must receive a truthful, immediately editable fallback template—never a fabricated resume summary. The system may use role facts that are already safely resolved from the target URL, but it must not fetch arbitrary sites or claim requirements that were not available in the authorized input.

### Output contract

The returned draft is first-person, 85–140 words, plain text, and fully editable. It may mention only experience or skills evidenced in the private resume and factual target-company context. It must not imply a personal connection, promise an introduction, guarantee review, invent metrics, repeat sensitive resume details, or name a Referrer. A deterministic fallback must always be available when the model or private document analysis is unavailable.

## Social milestone card

### Eligibility and consent

Only either participant in an already accepted private referral request may create a card. Creation is a separate explicit action; no card, token, external share action, or notification is created automatically after approval or a progress update. A participant may revoke their own card. The other participant’s identity and consent decision are never represented by a card.

### Factual public copy

The public card contains only the skipwait.me brand and a company label. Approved requests use: **“A private referral request was accepted at {company}.”** Later milestones may use: **“A referral introduction at {company} was recorded.”** The subtitle is always: **“Shared voluntarily. No hiring outcome is implied.”**

The product must not use “Fast-Tracked,” “guaranteed,” “priority,” “skip the line,” queue position, employee name, candidate name, role URL, resume information, message content, compensation, interview details, or success-rate language.

### Public delivery contract

Each card uses an opaque high-entropy token. The public share page and dynamic social image resolve only an active token’s safe company-level copy. They do not require sign-in and contain no application action, job link, participant identifiers, referral-request ID, or private data. A revoked or unknown token returns a neutral unavailable state. The image is generated deterministically from the safe copy in the enterprise-blue and slate visual system; no AI-generated text image is needed.

## Acceptance criteria

1. Cross-user calls cannot read a document, draft, card token, or private request information.
2. Model failure and non-PDF attachment handling return an editable factual fallback, not an error dead-end.
3. Every generated draft is bounded, editable, and prohibited from inventing facts or a referral guarantee.
4. Every public card is company-only, contains the required disclaimer, and is revocable.
5. The mobile flows retain a single primary action per viewport and use only the enterprise-blue and slate palette.
