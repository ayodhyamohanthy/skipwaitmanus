-- The supporting user index is created in 0007 before replacing the former single-role unique index.
-- Retain this migration as a compatibility no-op because the schema snapshot already includes that index.
SELECT 1;
