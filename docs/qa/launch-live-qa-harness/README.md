Anonymous production QA harness for skipwait.me. REBUILT 2026-10-31 (rev 2: packshots.js 1280 scroll fixed); NOT an identical restoration of the earlier harness (crawl.js and the 59-URL sitemap crawl are not rebuilt).
Requires: node, system /usr/bin/google-chrome, playwright-core 1.64.1 (npm ci). No secrets, no accounts, read-only, no clicks.
packs.js: anonymous /plans at 1280 and 390. Asserts HTTP 200, final path /plans, 0 pageerrors, exactly 4 "Not on sale yet", scrollWidth <= viewport. Exit 0 only on pass. Saves /downloads/packs-<w>.png.
packshots.js: scrolls to the pack section and saves screenshots for visual inspection (DOM text count alone is not pixel proof).
Missing: crawl.js (sitemap crawl at 1280/390), api-legs.py (anon 401 checks; these are two curls: /api/credits/summary and /api/referrer/home-bundle must return 401), any authenticated test (no sessions; OTP paused).
