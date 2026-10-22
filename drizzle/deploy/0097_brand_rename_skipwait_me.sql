-- 0097: the founder's naming rule (Oct 20, 2026): the brand is skipwait.me, not
-- bare "SkipWait". 0076 seeded the operator's own directory row as "SkipWait";
-- rename just that display name. Idempotent: no-op once the row already reads
-- skipwait.me. Slug, initials and domains are unchanged.
UPDATE `companies` SET `name` = 'skipwait.me' WHERE `slug` = 'skipwait' AND `name` = 'SkipWait';
