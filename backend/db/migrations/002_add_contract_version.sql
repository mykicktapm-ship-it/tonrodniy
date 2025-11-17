-- Adds contract_version tracking to rounds so every row references the deployed TONRODY contract release.
ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS contract_version text;

UPDATE rounds
SET contract_version = COALESCE(contract_version, 'v1.0-f6-beta');
