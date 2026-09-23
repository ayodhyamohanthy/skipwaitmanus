-- First consumer of the deploy-time migration gate. Changes nothing; proves
-- the runner can connect over TLS, apply a file and record it in the ledger.
SELECT 'deploy migration gate reachable' AS proof, DATABASE() AS db, VERSION() AS mysql_version;
