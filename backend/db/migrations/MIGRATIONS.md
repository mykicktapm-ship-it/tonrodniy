# Migration log

1. `001_init.sql` – baseline schema (users, lobbies, seats, rounds, tx_logs, audit_logs).
2. `002_add_contract_version.sql` – adds `contract_version` column to `rounds` so every round references the deployed contract version.
3. `003_add_referrals.sql` – _reserved_ for referral payouts.
4. `004_add_lobby_class.sql` – _reserved_ for lobby classification / sharding.

Apply migrations sequentially via `psql` or `supabase db push` to keep Supabase aligned with backend expectations.
