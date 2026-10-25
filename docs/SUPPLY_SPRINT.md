# Supply sprint kit (D-015)

The founder sends every message. Agents never send outreach. Written Oct 18 2026 by Claude Code for queue row P0d (D-053 supply tier). Spec: `docs/GROWTH_STRATEGY.md` moves 1, 2 and 7 (D-043). Rules: `docs/DECISIONS.md` D-006, D-015, D-016, D-017, D-022, D-028, D-043, D-049, D-050, D-055, D-057, D-063, D-064.

**This repository is public on GitHub.** Keep this file as the blank template. Fill in the shortlist and the tracker in your own private copy, never here (section 5 says why).

## 1. Purpose and checkpoints

Supply is the binding constraint. On Oct 18 the live directory lists 39 companies, and only one, SkipWait itself, has an available verified referrer (`https://skipwait.me/api/companies`: `openCount` 1). An ask to any other company has no available referrer to see it. This sprint gets real employees at a short list of companies to verify their own work email, so asks reach a person. It runs to Wed Nov 18 (day 30), then on to the 3×3 bar by Fri Dec 18 (day 60), at about 10 hours a week: 5 personal one-to-one messages each weekday (about 25 a week), one follow-up each (D-015, D-043 move 1, D-064). The same plan produced 0 outside referrers from August to October because the outreach never really started. Sending the messages is the job.

The day numbers count from Mon Oct 19, when D-064 restarted the sprint clock because this kit only landed Oct 18. Outreach starts now; it does not wait for the payment build (D-064).
- **Day 14, Mon Nov 2:** at least 50 first messages sent. Under 50: stop, and the owner decides whether the founder time exists. 50 or more but fewer than 3 verified outside referrers: change the companies or the message, not the effort.
- **Day 30, Wed Nov 18:** target one focus company with at least 3 available outside verified referrers, and one outside ask decided within 72 hours (D-064). If no company has 2 or more, narrow to one company and revisit the launch-door row (D-016).
- **Day 60, Fri Dec 18:** target 3 outside companies with at least 3 available verified referrers each (the 3×3 bar, D-064).

The 3×3 bar no longer gates pass sales (D-046). It is this sprint's day-60 target. US, UK, Singapore and UAE roles wait until it is met (D-043).

**Start in 10 minutes (outreach starts now, D-064):**
1. Copy the section 2 shortlist and the section 5 tables into a private sheet or note. Filled numbers never go in this repo.
2. Read the rules at the top of section 3 (2 minutes).
3. Send 5 first messages now, with template A or C. Start with people at Wipro, TCS, Merkle or Go Neutrinos, beginning with anyone who already said yes off-platform (D-016). Then anyone you know at another shortlist company.
4. Log the 5 in your private tracker.
5. Put these in your calendar now: a daily 30-minute slot for 5 messages, a short reading every Monday (section 5), Mon Nov 2, Wed Nov 18 and Fri Dec 18. A written date and time raises follow-through (Milkman et al., PNAS 2011).

**Later today or tomorrow:** sign in as admin and open https://skipwait.me/admin/flow-health. Copy each shortlist company's row from "Waiting demand by company" and "Verified coverage by company" into your private copy of section 2, then re-rank and choose the focus company (D-064). Rows are keyed by email domain. Each table lists at most 12 companies, so a company that isn't listed has 0 there. If the panel is empty or down, keep Group A first.

Pace: 5 each weekday from Mon Oct 19 (anything you send before then is a head start). That is 25 by Fri Oct 23 and 50 or more by Mon Nov 2, day 14 (D-064). Missed a day? Catch up before the weekend.

## 2. Corridor shortlist

The corridor is the short list of companies where supply is built first. Rank it on three things together (D-043 multiplies them):
1. **Aggregate waiting demand** from the panel. Count every waiting ask the same. Never look at who paid, and never pick a company because a paying customer wants it (D-015). The current runtime still expires waiting asks after 7 days, so the panel shows only the last week; D-174 removes that expiry when `D-174-expiry-clock-removal` lands. Read it at each checkpoint, not once.
2. **Your access.** A company where you can send 5 messages beats one where you can send 1. A company with demand but no way in waits until you find one.
3. **Referral leverage:** India offices hiring lateral engineering, product and data roles, Bengaluru and Hyderabad first (D-043).

Work first where waiting demand and your access overlap.

Picked from the live directory on Oct 18 without demand data (the panel is admin-only). Group A is the D-016 launch doors: people there committed off-platform, so they come first. Group B is directory companies whose listed functions include engineering, technology, product or data and that are assumed to hire in India. That assumption is unchecked: confirm or swap any row.

**Domain check.** A referrer counts for a company only when their work email ends in exactly that company's directory domain. Asks route on the exact domain, so a country subdomain or a group domain (for example `name@in.example.com`) does not count, even though it verifies. If you're unsure which domain someone uses, ask before they verify. After they verify, check that the panel lists them under the company's domain. Report any mismatch to an agent. Never just add the other domain to the directory: that would show the company as open to seekers while their asks still reach no one.

| # | Group | Company (slug) | Email domain | Listed functions | Waiting asks | Messages | Verified / available | Your access | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | A | Wipro (`wipro`) | wipro.com | Engineering, Data, Operations | | 0 | | | not started |
| 2 | A | TCS (`tcs`) | tcs.com | Engineering, Data, Operations | | 0 | | | not started |
| 3 | A | Merkle (`merkle`) | merkle.com | Data, Design, Operations | | 0 | | | not started |
| 4 | A | Go Neutrinos (`go-neutrinos`) | goneutrinos.com | Engineering, Product, Design | | 0 | | | not started |
| 5 | B | Infosys (`infosys`) | infosys.com | Consulting, Technology, Operations | | 0 | | | not started |
| 6 | B | Accenture (`accenture`) | accenture.com | Consulting, Technology, Operations | | 0 | | | not started |
| 7 | B | Cognizant (`cognizant`) | cognizant.com | Consulting, Technology, Operations | | 0 | | | not started |
| 8 | B | Capgemini (`capgemini`) | capgemini.com | Consulting, Technology, Operations | | 0 | | | not started |
| 9 | B | ServiceNow (`servicenow`) | servicenow.com | Engineering, Product, Operations | | 0 | | | not started |
| 10 | B | IQVIA (`iqvia`) | iqvia.com | Engineering, Data, Operations | | 0 | | | not started |
| 11 | B | CitiusTech (`citiustech`) | citiustech.com | Engineering, Data, Operations | | 0 | | | not started |
| 12 | B | Lenovo (`lenovo`) | lenovo.com | Engineering, Product, Operations | | 0 | | | not started |
| 13 | B | KPMG (`kpmg`) | kpmg.com | Consulting, Technology, Operations | | 0 | | | not started |
| 14 | B | BlackRock (`blackrock`) | blackrock.com | Finance, Technology, Operations | | 0 | | | not started |
| 15 | B | BNP Paribas (`bnp-paribas`) | bnpparibas.com | Finance, Technology, Operations | | 0 | | | not started |

How to fill it in (in your private copy only):
- **Waiting asks:** a band, never an exact count: 0, 1–2, 3–9, 10+.
- **Verified / available:** the panel's "Verified" and "Available now" for that company, for example "2 / 1".
- **Your access:** counts per path, never names. W warm contact, M via a mutual, P past colleague, O public offer. Example: "W2 P1".
- **Status:** not started, messaging, replied, 1+ verified, 3+ available.

**Swap-ins** (also in the live directory): IBM and Societe Generale (check the email domain first: staff may use a country or short domain), MongoDB, Snowflake, Stripe, Maersk, Ford, Capco, Concentrix, Korn Ferry, Pinterest, Kraken, HashiCorp, Discord, 1Password, Varonis, Upstart, OpenAI, Coinbase, SoFi, Gemini, Blackstone, Nintendo. For a company outside the directory, ask an agent to add it first.

## 3. Message templates

Rules for every message:
- One person, one message, from your own WhatsApp, LinkedIn or personal email. Never their work email or work chat. Rewrite the first line in your own words.
- In outreach, send only this link: https://skipwait.me/sign-in?intent=referrer. It opens "Give a referral" (work email only, D-030, D-049).
- Never send a link that contains `invite=`, including your own `/invite` or `/share` links, and never point anyone to those pages. Those links can add a credit, and a credit is a perk (D-015, D-055).
- Keep "Please follow your company's referral policy." in every message (D-043).
- Say "referral request", not "ask" (D-180). Leave the money sentence word for word until the terminology lane rewords it (D-173).
- Never mention a specific seeker, job or resume, a referral bonus, or anything for them (perks, credits, gifts). Never say how fast anything will happen.
- Via a mutual: ask the mutual first ("Okay if I message {Name} about SkipWait?"). Send only after a yes.
- One follow-up after 3 days if there is no reply. Then stop.

**A. Warm contact**
```
Hi {Name}! A small ask, and no is a fine answer.
I'm building SkipWait: job seekers send a private referral request, and verified employees decide whether to help.
Would you verify your {Company} work email? It's one code to your work inbox: https://skipwait.me/sign-in?intent=referrer
You choose which requests to take, if any, and can pause anytime. Seekers don't see your name unless you accept. If people already message you for referrals, you also get your own link to send them.
Please follow your company's referral policy.
```

**B. Second-degree, via a mutual**
```
Hi {Name}, I'm {your name}. {Mutual} said it was okay to message you.
I'm building SkipWait: job seekers send a private referral request, and verified employees decide whether to help. I'm looking for people at {Company} open to an occasional request.
If that's you, it's one code to your work email: https://skipwait.me/sign-in?intent=referrer
You pick which requests to take, if any, and can pause anytime. Your name stays hidden unless you accept. You also get your own link for people who already ask you for referrals.
Please follow your company's referral policy. If it's not for you, no reply needed.
```

**C. Past colleague**
```
Hi {Name}, {your name} here, from our {team} days. Hope all is well at {Company}.
I'm building SkipWait: job seekers send a private referral request, and verified employees decide whether to help. Would you be open to an occasional referral request for roles at {Company}?
If yes, verify your work email with one code: https://skipwait.me/sign-in?intent=referrer
You decide which requests to take, if any, and how many a month. You can pause anytime, and your name stays hidden unless you accept. You also get your own link for people who already ask you for referrals.
Please follow your company's referral policy. Totally fine to say no.
```

**Follow-up (once, after 3 days)**
```
Hi {Name}, a gentle nudge on SkipWait in case it got buried: https://skipwait.me/sign-in?intent=referrer
Please follow your company's referral policy. If now isn't a good time, no problem at all. I won't follow up again.
```

**After they verify**
```
Thank you, {Name}! You're verified at {Company}.
- Asks appear at https://skipwait.me/queue. If one isn't for you, tap "Pass privately" so it moves on. That includes asks through your own link.
- Your own link is on that page, card "Your Fast-Track Link" (shown when your queue is empty). Asks through it come only to you. "Pause link" turns it off.
- Optional setup (areas, asks a month, emails): https://skipwait.me/referrer-setup. Pause new asks at https://skipwait.me/referrer-home.
- Hiring on your team? Post the role at https://skipwait.me/post-opportunity. Asks on it come to you first for 48 hours.
- A colleague might want this too? The same link works: https://skipwait.me/sign-in?intent=referrer
Please follow your company's referral policy. If it helps, I can send a calendar invite for a weekly 10-minute look. Optional.
```

**Optional demand line.** Add "Several people are waiting for a referral at {Company} right now." only when you can confirm at least 3 different people are waiting there (D-043). Never a number, never a detail. The panel counts asks, not people. If unsure, leave it out.

**If they ask:**
- *Is this allowed?* "Some companies limit referrals, for example to people you know. Follow your company's referral policy. You can pass on any ask, privately."
- *Do I get paid?* "No. SkipWait doesn't pay referrers, and seekers can't pay you through it."
- *Do the people I refer pay?* "3 free credits every month; extra asks use credits. Referrers are never paid and never ask you for money. Credits are paid to SkipWait, and referrers never pay." (D-063 as worded by D-135) Count this objection in section 5.
- *Will seekers see who I am?* "Not unless you accept. Until then they see 'Someone at {Company}' and 'Verified via work email'. After you accept, they see your account name. For an account made with the work-email code, that is the part of your work email before the @."
- *The code didn't arrive.* "Check spam or quarantine; some company filters hold new senders. You can ask for a new code after 30 seconds."
- *Why does my queue show 'Referral credits'?* "Ignore it. Referrers never spend credits, and accepting an ask costs you nothing."
- *Will my company know?* "SkipWait doesn't tell your company. Its public page never shows who is verified there or how many. The code, and new-ask emails if you keep them on, go to your work inbox. You can turn new-ask emails off in setup."
- *How much time?* "You set how many asks a month, from 1 to 15. The default is 3. The app estimates about 5 minutes an ask."
- *Why a work email?* "The code proves you can receive email at {Company} today. It doesn't prove your role, and it doesn't mean {Company} endorses SkipWait."
- *What if I leave {Company}?* "Pass on your open asks, then ask through skipwait.me/help to remove your badge."

**Never promise:**
- Speed. The 7-day answer promise ships only once it is kept (D-043 move 4).
- That referrals are free (D-043 move 3, D-063).
- That their record follows them to the next job. D-057 is decided, not built.
- That SkipWait stores only a fingerprint of their email. Work-email sign-in keeps the address as the account login (`server/_core/otpLogin.ts`).
- That passing gives the seeker their credit back. A pass keeps the credit spent while the ask goes on to colleagues (D-147; D-035 is rejected).
- That {Company} is a partner of SkipWait or endorses it.

## 4. Two vouch questions

Ask the first 5 verified referrers, after they verify (D-043 move 7). Each is one tap: send them as WhatsApp polls, or ask for two letters back. Record counts only, in your private tracker (section 5), never by company.

```
Two quick questions to help me build this right. Reply with two letters, like "A C".
1. Does {Company}'s referral form ask how you know the candidate?
A) Yes  B) No  C) Not sure
2. If a stranger's ask fits a role well, what would you do?
A) Refer, and say we haven't worked together
B) Refer, same as anyone else
C) Send it to a recruiter instead
D) Pass. I only refer people I know
```

Decision rule: if 4 of the first 5 answer 1B and 2B (their form doesn't ask, and they would write nothing different), drop the vouch step. Otherwise the answers shape the accept-time tap ("I know their work" / "Profile match: I don't know them" / "Forward to a recruiter"), built only after 10 accepted outside asks.

## 5. Tracker (aggregate fields only)

- **Fill it in a private copy (a private sheet or note), never in this file.** This repo is public. Per-company numbers here could point to one referrer or alert an employer. The public directory shows no availability status and no counts (D-176). D-043 rejects showing employers per-company demand and publishing per-company norms.
- Counts only, even in private. No seeker names or details, ever.
- Referrer names, numbers and emails stay in your own phone, WhatsApp or private sheet, never in this repo.
- Update it once a day. Every Monday, record messages sent, outside referrers verified and available referrers at the focus company (D-064). For a review, paste the totals into a session with an agent.

**Daily log.** By path: W warm, M mutual, P past colleague, O public offer.

| Date | First messages | By path (W/M/P/O) | Running total | Target total | Follow-ups | Replies | Yes | No |
|---|---|---|---|---|---|---|---|---|
| Sun Oct 18 (head start) | | | | – | | | | |
| Mon Oct 19 | | | | 5 | | | | |
| Tue Oct 20 | | | | 10 | | | | |
| Wed Oct 21 | | | | 15 | | | | |
| Thu Oct 22 | | | | 20 | | | | |
| Fri Oct 23 | | | | 25 | | | | |
| Mon Oct 26 | | | | 30 | | | | |
| Tue Oct 27 | | | | 35 | | | | |
| Wed Oct 28 | | | | 40 | | | | |
| Thu Oct 29 | | | | 45 | | | | |
| Fri Oct 30 | | | | 50 | | | | |
| Mon Nov 2 | | | | 55 | | | | |

Add a row per day after Nov 2.

**Checkpoint readings.** Panel numbers for outside companies only (never skipwait.me). The median decision time is the exception: the panel can't filter it, so it includes SkipWait's own asks.

| Date | First messages so far | Replies | Yes | Verified | Available now | Available at the focus company | Companies with 1+ / 2+ / 3+ available | Active outside referrers, 7 days | Median time to first decision | Links shared (self-reported) |
|---|---|---|---|---|---|---|---|---|---|---|
| Sun Oct 18 (baseline) | 0 | 0 | 0 | | 0 | 0 | 0 / 0 / 0 | | | 0 |
| Mon Oct 26 | | | | | | | | | | |
| Mon Nov 2 (day 14) | | | | | | | | | | |
| Mon Nov 9 | | | | | | | | | | |
| Mon Nov 16 | | | | | | | | | | |
| Wed Nov 18 (day 30) | | | | | | | | | | |

Then add a row every Monday until Fri Dec 18 (day 60, D-064).

**Counters**

| Counter | Count |
|---|---|
| Objection: "my friends would have to pay" | 0 |
| Objection: company referral policy | 0 |
| Objection: privacy, or my company seeing it | 0 |
| Objection: no time | 0 |
| Public offers: reviewed / messaged / refused for money / refused, other | 0 / 0 / 0 / 0 |
| Referrers removed for selling referrals | 0 |
| Vouch question 1: A / B / C | 0 / 0 / 0 |
| Vouch question 2: A / B / C / D | 0 / 0 / 0 / 0 |
| Vouch: answered 1B and 2B | 0 |

## 6. Screening public "I can refer" offers

Where: posts from the last 30 days on r/developersIndia ("Referral" flair), Blind and LinkedIn, by people offering referrals at their own company (D-043 move 2).

How: one personal message each, not a public comment. Say that you run SkipWait. Follow each community's rules; where promotion is banned, don't post. No scraping, no automation, no bulk sends.

Refuse, and never onboard, anyone who:
1. Asks for money or anything of value for a referral: a fee, a "processing" or "registration" charge, a share of the joining bonus, a paid course or group, gift cards, crypto (D-006).
2. Promises a job, an interview or a "guaranteed" referral.
3. Offers referrals at many companies, or at a company where they don't work.
4. Collects resumes or phone numbers in bulk (forms, Telegram or WhatsApp groups).
5. Won't verify their own work email. Never verify for anyone (D-015).

Mentioning their company's own referral bonus is not a reason to refuse. Just never pitch on it (D-043).

If an onboarded referrer turns out to sell referrals: suspend them at https://skipwait.me/admin/users, stop public-offer outreach, and count it in section 5 (D-043 stop rule).

## 7. What a new referrer gets today

| What | Where | Notes |
|---|---|---|
| Sign-in and verification by work-email code (D-030, D-049) | https://skipwait.me/sign-in?intent=referrer | Work email only. Six-digit code, valid 10 minutes, subject "Your skipwait.me verification code". Resend after 30 seconds; 5 wrong codes lock it for 15 minutes. Lands on setup. Members already signed in verify at https://skipwait.me/verify. |
| Asks start reaching them | https://skipwait.me/explore | Within a minute of verifying. Verified, not paused, not suspended and under capacity (3 by default) routes the company's asks to them. The /explore list shows no availability label (D-176); the company page still does (known gap below). |
| Setup | https://skipwait.me/referrer-setup | Areas and levels, asks a month (1–15), new-ask emails on or off. |
| Home and pause | https://skipwait.me/referrer-home | "Pause new asks" stops new review emails, and a paused referrer stops counting as available. It does not switch off the personal link: use the link card's "Pause link" for that. |
| Asks | https://skipwait.me/queue, https://skipwait.me/inbox | Accept, or "Pass privately". The seeker gets a short note, never the referrer's name, and the ask stays open to colleagues (D-021). On a personal-link ask the seeker knows whose link they used. |
| Personal link (D-017) | https://skipwait.me/queue, card "Your Fast-Track Link" | An address like `skipwait.me/refer/wipro/ref-…`, with Copy and "Copy for LinkedIn bio". Asks through it go only to that referrer, for jobs at the same company. The card's "Pause link" retires that address for good; a new one can be made. |
| Posted roles (D-022) | https://skipwait.me/post-opportunity ("Your openings" to renew or close) | Needs a public job link on the company's own careers site or ATS. Shows on https://skipwait.me/explore/{company-slug} and https://skipwait.me/wall as "a verified employee" unless they choose to show a first name. Hides after 30 days unless renewed with one tap. Asks on it go to the poster alone for 48 hours, then to colleagues. |
| Private record (D-057) | https://skipwait.me/referrer/impact | Referrals accepted, pending decisions, unread messages. Only they see it: never ranked, never public. Not built yet: keeping the record across a job change or a gap (D-057). Don't promise it. |
| Help | https://skipwait.me/help | Leaving the company: pass on open asks, then ask here to remove the badge. |

Known gaps (not fixed by this kit; tell an agent):
- **Pausing leaves the personal link on.** A paused referrer's link still creates asks for them, and they get no review email while paused. Anyone who pauses should also tap "Pause link".
- **The company page still shows availability.** https://skipwait.me/explore/{slug} still reads "People open to referral requests" or "Not open yet" (`client/src/pages/ExploreCompany.tsx`). D-176 removes availability framing; #609 removed it from the /explore list only.
- **The link card hides behind waiting asks.** On https://skipwait.me/queue the card shows only when the queue is empty (`client/src/pages/MyCompanyInbox.tsx`).
- **Referrers see a "Referral credits" meter** on an empty /queue (`client/src/components/ReferrerCreditsCard.tsx`), though referrers never spend credits (D-055).
- **What asking costs.** The truth pass shipped (D-063, Oct 18): every product surface says "3 free credits every month; extra asks use credits. Referrers are never paid and never ask you for money." (worded by D-135, Oct 21) Use the same words in outreach; the legal pages (Terms, Refund Policy) still carry older lines until the owner rewords them.
- **Link previews are generic.** Every SkipWait link, including personal links, unfurls on WhatsApp as the general seeker card (D-028, queued).
- **Link asks are invisible to admin.** No admin view counts asks sent through personal links, so the move-2 link numbers are self-reported for now.

## 8. Reviews

**Metric definitions**
- **First message:** one personal message to one person at a shortlist company, from your own account. Not counted: follow-ups, group posts, public comments, bulk or automated sends. Direct messages to public offerers count, as path O.
- **Follow-up:** the single nudge after 3 days. Not counted toward the 50.
- **Reply:** any answer, including no. **Yes:** says they will verify.
- **Verified:** the panel's "Verified" for shortlist companies (https://skipwait.me/admin/flow-health, "Verified coverage by company"). SkipWait's own domain and the admin mailbox domain never count.
- **Available now:** the panel's "Available now": verified, not paused, not suspended, under capacity. The same rule routes an ask to a referrer. The /explore list shows no availability (D-176); the company page still does (known gap above).
- **Open outside company:** a directory company other than SkipWait with at least 1 available referrer. Check: the companies marked `"openToReferrals":true` at https://skipwait.me/api/companies, not counting SkipWait. D-176 makes availability routing only, never a public label. Oct 18: 0.
- **3×3 bar:** at least 3 outside companies with at least 3 available referrers each. The panel prints "Companies at or above 3 available referrers" under the coverage table; leave SkipWait out if it is one of them.
- **Focus company:** the one company you aim to bring to 3 or more available outside verified referrers, with one outside ask decided within 72 hours, by day 30 (D-064). Name it only in your private copy.
- **Active outside referrers:** the panel's "External referrers active, 7 days".
- **Time to first decision:** the panel's "Median time to first decision": from the ask being sent to the first accept or pass, across all companies, SkipWait included.
- **Verify rate:** verified ÷ first messages. The D-043 "becomes a 10" bar is 10% or more over the first 100 messages.
- **Link shared:** a referrer tells you they put their personal link in a bio or sent it to someone. Self-reported.

**Day 14, Mon Nov 2**
1. Fewer than 50 first messages? Stop. The plan failed on execution again. Decide whether the founder time exists before anything else (D-043).
2. Read the panel and fill in the day-14 row.
3. 50 or more messages but fewer than 3 verified? Change the companies or the message, not the effort. Use the objection counts to choose.
4. Verified but not available? Ask the person whether they paused or their capacity is full.
5. "My friends would have to pay" counted 2 or more times? The owner rules on free link asks (D-043 move 2).
6. Anyone found selling referrals? Suspend, stop public-offer outreach (section 6).
7. D-050 is live, so suggest the LinkedIn-bio step.
8. Re-rank the shortlist with the latest demand bands.

**Day 30, Wed Nov 18**
1. Does the focus company have 3 or more available outside verified referrers (D-064)? Name it in your private copy, not in this repo. The 3×3 bar is due Fri Dec 18.
2. No company with 2 or more available outside referrers? Narrow to one company for the next 30 days, and the owner revisits the launch-door row (D-016).
3. Did 10% or more of the first 100 messages end in a verified referrer? Was any outside ask decided within 72 hours? Ask your referrers: the panel's median mixes in SkipWait's own asks.
4. Personal link: fewer than 3 of 25 pitched referrers shared it, or fewer than 5 link asks in total? Keep the link as a feature only (D-043 move 2).
5. Vouch: did 4 of the first 5 answer 1B and 2B? Drop the vouch step (section 4).
6. Launch doors: have people at Wipro, TCS, Merkle and Go Neutrinos verified? If not, the owner decides whether the landing row stays (D-016).
7. Write the before and after into the D-015 row of `docs/DECISIONS.md`: open outside companies 0 on Oct 18, and the Nov 18 number.
8. Next: with 3 or more available at any company, repeat the sprint at adjacent companies (days 31–60, toward the 3×3 bar by Fri Dec 18, D-064). With none by day 60, narrow to one company, build no supply features, and the owner decides whether the founder time exists (D-043).
