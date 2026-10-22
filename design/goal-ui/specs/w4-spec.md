# W4 SPEC - referrer wave (12 surfaces) [re-created Oct 22 from my record]

Doctrine: trust, not pressure. No urgency theatre. Passing is always private and okay; capacity is theirs. No referrer purchase UI (D-067). Only money line: REFERRER_MONEY_SENTENCE. Private record, no public leaderboard.

1 /refer/:slug/:alias bridge (seeker-facing): "This person can open the door." one commit Send the ask; level-cost quote now in main.
2 /referrer gate: "Verify your work email to see your asks." commit Continue with work email; keep error copy verbatim in GoalStates.
3 /referrer-home: "Here's what needs you today. Nothing here is urgent unless it says so." rows dot+text, mono dates, capacity stepper, re-verify countdown (amber dot). One commit per row: Review. Sample rows already shipped (#425).
4 /referrer-setup: "Sign in, verify a work email, then choose what you can judge." one step per state.
5 /referrer/impact: "PRIVATE BY DEFAULT" kick, mono numerals, honest zeros, no ranking.
6 /conversation/:id referrer side: Accept (black), Pass (ghost), D-052 quick replies "At capacity" / "Prefer not to say" both RELEASE the credit - say so at the tap. "Passing is private and always okay."
7 /share: "You found an opportunity. Help a friend do the same." commit Copy personal invite link.
8 /share-card/:token: who invited (first name), what it is, one commit See open doors.
9 /invite: two doors, "Tell us where you want to work." / "Invite someone inside."
10 /p/:handle: visibility controls verbatim, opt-in, private by default.
11 /approve: "Unanswered approvals expire after 24 hours." mono numeral, amber dot under 6h.
12 /landed: "Welcome to the other side of the door." 3 points, commit See today's asks.

Deltas: kill all kit imports (ReferrerHome 2, ReferrerSetup 2, Impact 1, Conversation 1, Invite 1, PublicProfile 1, Approve 1, Landed 2); status dot+text no pills; mono for counts/dates; phone rows stack; 1280+390 captures; GoalStates for errors. Parked to W5: /inbox, /messages, /alerts. Mocks: referrer-home + landed (re-send needs rebuild).
