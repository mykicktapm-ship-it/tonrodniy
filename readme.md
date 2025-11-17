# TONRODY · Phase F5

TONRODY is an honesty-first lobby platform where every lobby seat, TON stake, and payout can be audited end-to-end. Phase **F5**
brings the smart-contract online, wires the backend to Supabase and WebSockets, and lets the frontend switch from deterministic
mocks to the live API + TON Connect wallet layer.

---

## Repository map

```
backend/    # Express + ws server, Supabase integration, TON webhook receiver
contracts/  # Tact source, build artifacts, deployment config
frontend/   # Vite + React + Chakra UI client, Ton Connect UI bootstrap
docs/       # Architecture, fairness protocol, Supabase schema, UX specs
```

---

## Prerequisites

1. **Tooling** – Node.js 18+, pnpm 8+, Git, Docker (optional for local Postgres), toncli/blueprint for contract deploys.
2. **Accounts** – Supabase project (database + service role key), Telegram bot (alerts), TON testnet wallet (for deploy + QA).
3. **Cloning** – `git clone` the repo, then `pnpm install` once at the workspace root to hydrate shared dependencies.

---

## Environment variables

All sensitive values live outside source control. Use [`backend/.env.example`](./backend/.env.example) as the template and create
the following files before running any process.

### Backend `.env`

| Variable | Purpose |
| --- | --- |
| `PORT` | Port for the Express + ws server (default `4000`). |
| `SUPABASE_URL` | Supabase project URL (`https://<project>.supabase.co`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key for privileged reads/writes. |
| `JWT_SECRET` | Symmetric secret for backend-issued tokens. |
| `TELEGRAM_BOT_TOKEN` | Telegram bot for ops alerts. |
| `TON_WEBHOOK_SECRET` | Shared secret for verifying `/ton/events` callbacks. |
| `TON_NETWORK` | Label used in logs + API responses (`testnet` during F5). |
| `TON_RPC_URL` / `TON_API_KEY` | RPC endpoint + token for toncenter/tonapi once live node wiring replaces mocks. |
| `TON_CONTRACT_ADDRESS` | Deployed Tonrody contract address (must match `contracts/ton.config.json`). |
| `TON_DEPLOYER_PUBLIC_KEY` / `TON_DEPLOYER_PRIVATE_KEY` | Hex-encoded keypair used when broadcasting contract transactions. |

### Frontend `.env`

Copy [`frontend/.env.example`](./frontend/.env.example) to `.env` (or `.env.local`) and fill:

```
VITE_API_BASE_URL=http://localhost:4000
VITE_WS_URL=ws://localhost:4000/ws
VITE_TONCONNECT_MANIFEST_URL=/tonconnect-manifest.json
VITE_TON_CONTRACT_ADDRESS=EQYourLiveContract…
VITE_TG_BOT_NAME=@yourbot
VITE_TG_APP_TITLE=TONRODY
VITE_APP_SALT=dev-only-salt
```

`VITE_API_BASE_URL`/`VITE_WS_URL` control REST + WebSocket URLs, `VITE_TONCONNECT_MANIFEST_URL` points TonConnect wallets to the manifest, and the Telegram/app fields drive UI branding.

---

## Supabase requirements

1. **Database schema** – Apply [`backend/db/migrations/001_init.sql`](./backend/db/migrations/001_init.sql) to your Supabase
   instance via `psql` or `supabase db push`. The migration provisions `users`, `lobbies`, `seats`, `rounds`, `tx_logs`, and
   `audit_logs` as described in `docs/tonrody_full_codex.md`.
2. **Secrets** – Paste your project URL + service-role key into `backend/.env`. The backend rejects requests until both values are
   present.
3. **Sequential migrations** – Number new SQL files `002_*.sql`, `003_*.sql`, etc., commit them with dependent features, and keep
   Supabase in sync before promoting a branch.

---

## Backend service (`pnpm dev:backend`)

1. Install dependencies once: `cd backend && pnpm install`.
2. Start the dev server with automatic reloads:
   ```bash
   cd backend
   pnpm dev:backend
   ```
   This runs `nodemon` + `ts-node`, exposing REST on `http://localhost:4000` (configurable via `PORT`) and WebSockets on
   `ws://localhost:4000/ws`.
3. Available scripts:
   - `pnpm build:backend` – emit JS to `backend/dist`.
   - `pnpm start:backend` – run the compiled server in production containers.
4. REST highlights: `/health`, `/lobbies`, `/lobbies/:id/join`, `/lobbies/:id/pay`, `/lobbies/:id/finalize`, `/rounds`, `/users`,
   `/ton/round-state/:id`, `/ton/events`.
5. WebSocket hub: clients connect to `/ws`, send `{ "type": "subscribe", "channel": "lobby:<lobbyId>" }`, and receive JSON events
   mirroring REST mutations plus contract telemetry. See “WebSocket channels” below for the topic list.

---

## Frontend (live API wiring)

1. Install dependencies: `cd frontend && pnpm install`.
2. Set the env vars described above so the client points to your backend + contract.
3. Run the dev server:
   ```bash
   cd frontend
   pnpm dev
   ```
   The app boots on `http://localhost:5173`, proxies API calls to `VITE_API_BASE_URL`, and loads the Ton Connect manifest from
   [`frontend/public/tonconnect-manifest.json`](./frontend/public/tonconnect-manifest.json). Use `pnpm build` + `pnpm preview` to
   smoke-test production bundles when needed.

---

## Smart-contract build & deploy (F5)

1. **Install tooling**
   ```bash
   cd contracts
   npm install
   ```
2. **Compile with Tact**
   ```bash
   npx tact compile Tonrody.tact --config ton.config.json
   ```
   Artifacts are emitted to `contracts/build/` according to `ton.config.json`.
3. **Deploy to testnet**
   - Use `toncli`/`blueprint` to send the compiled `.boc` + init data (`toncli deploy --testnet Tonrody.tact`).
   - Fund your deployer wallet via [https://testnet.ton.org/faucet](https://testnet.ton.org/faucet) before broadcasting.
   - Update `contracts/ton.config.json` and `TON_CONTRACT_ADDRESS` once the explorer shows the transaction.
4. **Smoke tests** – `npm run test` replays lobby creation, deposits, finalization, and payout flows using `ton-core`. Run it on a
   machine/CI runner with npm registry access if the sandbox blocks installs.

The backend ingests emitted events via `/ton/events`, while the frontend surfaces on-chain state via `/ton/round-state/:id`, so
contract + backend + Supabase must agree on lobby identifiers and seed commitments before going live.

---

## Commit → reveal workflow

1. **Commit** – When a lobby is opened, the backend (and contract) store `round_seed_commit = sha256(seedReveal)` alongside the
   lobby metadata (`lobbies.round_seed_commit`). This locks the fairness seed before any seat is filled.
2. **Join & stake** – Seats move through `free → taken → paid`. Each `PayStake` transaction is recorded in Supabase `seats` and in
   the contract’s participant map / tx log.
3. **Reveal** – Once all seats are paid, the backend calls `FinalizeRound` with the `seed_reveal`. The contract compares the hash
   against the commit, emits `WinnerSelected`, and exposes `roundHash` + winner index.
4. **Result verification** – The backend stores the same reveal + `round_hash` in Supabase (`rounds.round_hash`) and publishes it
   via API so any client can recompute `round_hash % seatsPaid`. Laboratory tools use these values to display reproducible proofs.
5. **Payout** – Only the computed winner can call `WithdrawPool`, producing a `PayoutSent` event and updating both Supabase and the
   contract log. Discrepancies trigger alerts via the audit tables.

---

## WebSocket channels & events

| Channel | Event types | Description |
| --- | --- | --- |
| `lobby:<lobbyId>` | `seat_update` | Seat reserved/released updates with countdown timers. |
|  | `payment_confirmed` | TON stake confirmed (includes tx hash + payer). |
|  | `timer_tick` | Countdown pulses so the UI can show seconds-to-lock. |
|  | `round_finalized` | Commit→reveal finished, exposes `roundHash`, winner index, payout info. |
|  | `lobby_closed` | Lobby archived or recycled into a new round. |

Clients must explicitly subscribe/unsubscribe via JSON messages after opening the socket. The backend automatically cleans up
subscriptions when sockets close to prevent stale listeners.

---

## Connecting a TON testnet wallet

1. **Manifest** – Verify [`frontend/public/tonconnect-manifest.json`](./frontend/public/tonconnect-manifest.json) reflects your
   local/staging origin (`http://localhost:5173` while running `pnpm dev`). Wallets fetch this file at runtime.
2. **Ton Connect provider** – [`frontend/src/providers/TonConnectUIProvider.tsx`](./frontend/src/providers/TonConnectUIProvider.tsx)
   bootstraps `TonConnectUI`, injects the manifest, and exposes the controller through app state.
3. **Wallet pairing**
   - Click the Ton Connect button in the header; select a wallet (Tonkeeper, MyTonWallet, OpenMask, etc.).
   - Choose **Testnet** inside the wallet when prompted and scan/confirm the pairing request.
   - Ensure the wallet holds testnet TON from the faucet before paying seats or deploying contracts.
4. **Transactions** – The frontend now calls `TonConnectUI.sendTransaction` directly, signing transfers to the lobby contract
   with payloads that contain `lobbyId`, `seatId`, and the caller’s identity. The backend only records the tx hash and waits for
   TON/webhook confirmation before marking a seat paid, so keep wallets connected to watch the full on-chain flow.

---

Need help? Start by skimming `docs/tonrody_full_codex.md` for the full mechanics, then follow the steps above to bring up Supabase,
the backend, smart contract, and the wallet-enabled frontend against the same lobby identifiers.
