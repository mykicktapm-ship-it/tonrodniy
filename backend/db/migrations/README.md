# Database migrations

This directory contains the baseline schema for TONRODY's Supabase/PostgreSQL database. `001_init.sql` is authoritative and all
future migrations should build on top of it (e.g., `002_add_referrals.sql`) instead of rewriting the initial file.

## Apply with `psql`
1. Export your Supabase/Postgres connection string, for example `export DATABASE_URL="postgres://postgres:password@127.0.0.1:5432/postgres"`.
2. Run the migration file directly: `psql "$DATABASE_URL" -f backend/db/migrations/001_init.sql`.
3. Verify the schema if desired via `npm --prefix backend run schema:print` (this simply prints the SQL you just applied).

## Apply with `supabase db push`
Supabase CLI expects migrations inside `supabase/migrations`. Symlink or copy the files from `backend/db/migrations` into that
folder (or configure your project so the CLI reads from this directory), then run:

```
supabase db push
```

The CLI will apply all migrations in order; because `001_init.sql` is now the baseline, subsequent `supabase db push` commands
should include new numbered files in this folder.

## Schema preview / verification
- `npm --prefix backend run schema:print` prints the baseline SQL so you can review or diff it without applying it.
- `psql "$DATABASE_URL" -c "\dt"` confirms the tables were created after running the migration.

Always commit new migration files alongside the features that rely on them so the backend, frontend, and smart-contract layers
stay in sync with the persisted schema.
