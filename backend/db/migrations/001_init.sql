BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enumerated types for status columns
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lobby_status') THEN
        CREATE TYPE lobby_status AS ENUM ('open', 'filling', 'locked', 'finalized', 'archived');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'seat_status') THEN
        CREATE TYPE seat_status AS ENUM ('free', 'taken', 'paid');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tx_action') THEN
        CREATE TYPE tx_action AS ENUM ('join', 'pay', 'leave', 'result', 'payout', 'ref_bonus');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tx_status') THEN
        CREATE TYPE tx_status AS ENUM ('pending', 'confirmed', 'failed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_actor_type') THEN
        CREATE TYPE audit_actor_type AS ENUM ('user', 'backend', 'contract');
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id text NOT NULL UNIQUE,
    username text,
    wallet text UNIQUE,
    avatar_url text,
    referral_code text NOT NULL UNIQUE,
    referred_by uuid REFERENCES users(id) ON DELETE SET NULL,
    balance_ton numeric(20, 8) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_wallet ON users (wallet);

CREATE TABLE IF NOT EXISTS lobbies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lobby_code text NOT NULL UNIQUE,
    class text,
    stake_amount numeric(20, 8) NOT NULL CHECK (stake_amount > 0),
    seats_total integer NOT NULL CHECK (seats_total > 0),
    status lobby_status NOT NULL DEFAULT 'open',
    round_wallet text NOT NULL,
    round_seed_commit text NOT NULL,
    round_seed_reveal text,
    round_hash text,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lobbies_status ON lobbies (status);
CREATE INDEX IF NOT EXISTS idx_lobbies_created_at_desc ON lobbies (created_at DESC);

CREATE TABLE IF NOT EXISTS seats (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lobby_id uuid NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
    seat_index integer NOT NULL,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    status seat_status NOT NULL DEFAULT 'free',
    taken_at timestamptz,
    paid_at timestamptz,
    released_at timestamptz,
    ton_amount numeric(20, 8),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT seats_lobby_seat_unique UNIQUE (lobby_id, seat_index)
);

CREATE INDEX IF NOT EXISTS idx_seats_lobby ON seats (lobby_id);
CREATE INDEX IF NOT EXISTS idx_seats_paid ON seats (lobby_id, seat_index) WHERE status = 'paid';

CREATE TABLE IF NOT EXISTS rounds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lobby_id uuid NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
    round_number integer NOT NULL,
    round_hash text,
    winner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    winner_wallet text,
    payout_amount numeric(20, 8),
    finalized_at timestamptz,
    tx_hash text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rounds_lobby_id ON rounds (lobby_id);
CREATE INDEX IF NOT EXISTS idx_rounds_winner ON rounds (winner_user_id);
CREATE INDEX IF NOT EXISTS idx_rounds_round_hash ON rounds (round_hash);

CREATE TABLE IF NOT EXISTS tx_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    lobby_id uuid REFERENCES lobbies(id) ON DELETE SET NULL,
    seat_id uuid REFERENCES seats(id) ON DELETE SET NULL,
    action tx_action NOT NULL,
    tx_hash text,
    amount numeric(20, 8),
    status tx_status NOT NULL DEFAULT 'pending',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tx_logs_tx_hash_key ON tx_logs (tx_hash);
CREATE INDEX IF NOT EXISTS idx_tx_logs_action ON tx_logs (action);
CREATE INDEX IF NOT EXISTS idx_tx_logs_created_at ON tx_logs (created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
    id bigserial PRIMARY KEY,
    actor_type audit_actor_type NOT NULL,
    actor_id text NOT NULL,
    action text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    hash text NOT NULL,
    signature text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_desc ON audit_logs (created_at DESC);

COMMIT;
