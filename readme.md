# TONRODY

TONRODY is an honest-round gaming surface defined in `plans.md`. Delivery is staged across multiple phases; Phase F3 introduces the backend skeleton while the frontend continues to render deterministic mock data until the two surfaces are integrated.

## Frontend workspace

The F1 foundation lives in [`frontend/`](./frontend/) and is a Vite + React + TypeScript project with Chakra UI for styling.

### Getting started

```bash
cd frontend
pnpm install
pnpm dev
```

- `pnpm dev` starts the local dev server on the default Vite port (5173).
- `pnpm build` type-checks and emits a production build to `frontend/dist`.
- `pnpm preview` serves the build for smoke testing.

### Directory map

```
frontend/
├── src/
│   ├── components/     # shared layout primitives (navigation bar, sections, badges)
│   ├── hooks/          # mocked data helpers (no real API wiring yet)
│   ├── lib/            # static constants and Tonrody copy blocks
│   ├── pages/          # Home, Laboratory, Earn, Profile shells from plans.md section 4
│   ├── state/          # placeholder UI state helpers for future stores
│   ├── theme.ts        # dark TONRODY theme definition
│   └── main.tsx        # Chakra + Router bootstrap
├── index.html          # Vite entry
└── vite.config.ts      # build configuration
```

No API, blockchain, or database calls are wired up in this phase. All data displayed on the screens are deterministic mocks that match the UX specification in `plans.md`.

## Backend (F3)

The Phase F3 backend lives in [`backend/`](./backend/) and mirrors the routes/channel plan captured in `docs/tonrody_full_codex.md`. It already publishes the Express + WebSocket skeleton so the frontend can swap off mocks as soon as integration lands.

### Dependency installation

```bash
cd backend
pnpm install
```

### Available scripts

- `pnpm dev:backend` proxies to `nodemon` with `ts-node` for instant feedback.
- `pnpm build:backend` type-checks and outputs JS to `backend/dist`.
- `pnpm start:backend` runs the compiled server (useful in production containers).

### REST and WebSocket surface

- `GET /health` returns the current status and timestamp.
- `GET /lobbies`, `GET /lobbies/:id`, `POST /lobbies/:id/join`, `POST /lobbies/:id/pay`, and `POST /lobbies/:id/finalize` drive the lobby lifecycle while broadcasting `seat_update`, `payment_confirmed`, and `round_finalized` events to subscribers.
- `GET /rounds` and `GET /rounds/:id` expose recent draw outcomes.
- `GET /users`, `GET /users/:id`, and `GET /users/:id/logs` surface player profiles and their audit trail.
- WebSocket clients connect to `/ws` and subscribe to `lobby:<id>` channels to receive deterministic event payloads that mirror the REST mutations.

The Express app relies on the Zod-backed environment loader in [`backend/src/config/env.ts`](./backend/src/config/env.ts) and the mock data stores in [`backend/src/data/`](./backend/src/data/) so the responses remain stable while Supabase wiring is in flight.

### Environment + Supabase seeding

1. Copy [`backend/.env.example`](./backend/.env.example) into `backend/.env` and supply your Supabase project URL, service-role key, JWT secret, Telegram token, and TON webhook secret before starting any backend process.
2. Apply the baseline schema found in [`backend/db/migrations/001_init.sql`](./backend/db/migrations/001_init.sql) using either `psql` or the Supabase CLI as outlined in [`backend/db/migrations/README.md`](./backend/db/migrations/README.md).
   - Example: `export DATABASE_URL="postgres://postgres:password@127.0.0.1:5432/postgres" && psql "$DATABASE_URL" -f backend/db/migrations/001_init.sql`.
   - If you prefer `supabase db push`, symlink/copy the migration file(s) into `supabase/migrations` before running the command so the CLI can seed your local stack.
3. Once the schema is seeded, run `pnpm dev:backend` (with the `.env` values in place) to serve the REST/WS mocks backed by your local Supabase instance; additional migrations should be numbered sequentially (`002_*.sql`, `003_*.sql`, etc.) and committed alongside dependent features.

## TON Connect

The frontend already boots the Ton Connect SDK so you can validate wallet flows locally before the smart-contract logic lands.

### Prerequisites and manifest location

- The Ton Connect manifest lives at [`frontend/public/tonconnect-manifest.json`](./frontend/public/tonconnect-manifest.json). Vite serves everything in `public/`, so it is automatically reachable at `http://localhost:5173/tonconnect-manifest.json` while running `pnpm dev`.
- Make sure the manifest fields reflect the environment you are testing:
  - `url` should point to the domain where the frontend is hosted (use `http://localhost:5173` for local runs).
  - `name` is the label wallets will show. Adjust it to match the product/branch name you are validating.
  - `iconUrl`, `termsOfUseUrl`, and `privacyPolicyUrl` can point to staging assets until production branding is finalized.
  These entries can be tweaked freely and redeployed without rebuilding the app because wallets always fetch the JSON at runtime.

### Provider configuration

- [`src/main.tsx`](./frontend/src/main.tsx) wraps the React tree with `TonConnectUIProvider` and passes the manifest URL relative to the site root: `<TonConnectUIProvider manifestUrl="/tonconnect-manifest.json">`.
- The provider implementation in [`src/providers/TonConnectUIProvider.tsx`](./frontend/src/providers/TonConnectUIProvider.tsx) lazily injects the `@tonconnect/ui` script, normalizes the manifest URL against `window.location.origin`, and pushes the controller plus the connected wallet object into the `walletStore`. This is the entry point you will extend when wiring real `TonConnectUI.sendTransaction` calls.

### Fake transaction service (temporary wiring)

- Screens that showcase transaction UX (e.g., the Laboratory page) call the mock helper in [`src/services/fakeTonService.ts`](./frontend/src/services/fakeTonService.ts). It simulates latency and returns a synthetic hash so the UI can exercise optimistic/toast flows.
- Once the TON contract + backend pipeline is available, replace `sendFakeTransaction` with a `TonConnectUI` submission that targets the deployed contract endpoint. The manifest + provider scaffolding described above remains the same; only the stubbed service will be swapped for the real send + confirmation handlers.

## F4 — Smart-contract & TON integration

### Contracts workspace

- [`contracts/Tonrody.tact`](./contracts/Tonrody.tact) defines the lobby lifecycle (creation, deposits, finalization, payouts) and emits `DepositReceived`, `LobbyFilled`, `WinnerSelected`, and `PayoutSent` telemetry that the backend ingests.
- [`contracts/tests/tonrody.spec.ts`](./contracts/tests/tonrody.spec.ts) replays the lifecycle with deterministic data so the serialization, tx log, and payout math stay reproducible.
- [`contracts/ton.config.json`](./contracts/ton.config.json) declares build output paths plus the reference testnet address that other surfaces subscribe to.
- Read the dedicated [`contracts/README.md`](./contracts/README.md) for the full walkthrough covering state layout, event schema, deployment guidance, and troubleshooting notes.

### Compiling and testing the Tact contract

1. Install dependencies once per environment:
   ```bash
   cd contracts
   npm install
   ```
2. Compile the contract via Tact (artifacts land in `contracts/build/`):
   ```bash
   npx tact compile Tonrody.tact --config ton.config.json
   ```
3. Replay the lifecycle tests (requires npm registry access—run locally or in CI if the sandbox blocks installs):
   ```bash
   npm run test
   ```

### Required TON environment variables

Populate these entries in `backend/.env` before wiring real nodes/providers:

- `TON_WEBHOOK_SECRET` – shared secret used by the contract listener when posting events.
- `TON_NETWORK` – `mainnet`, `testnet`, or the label you log against.
- `TON_RPC_URL` – RPC endpoint (toncenter/tonapi/etc.) the backend will query once `tonClient` sheds its stubs.
- `TON_API_KEY` – authentication token for the RPC provider if required.
- `TON_CONTRACT_ADDRESS` – the deployed contract the webhook + telemetry endpoints observe.

### Backend ↔ contract ↔ frontend telemetry

- `POST /ton/events` (implemented in [`backend/src/routes/tonWebhookRoutes.ts`](./backend/src/routes/tonWebhookRoutes.ts)) expects a JSON body of contract events plus the `x-ton-webhook-secret` header. Each event is validated, persisted via `appendTxLog`, and, when a `roundId` is present, merged into the in-memory round model so Supabase mirrors the contract state.
- `GET /ton/round-state/:id` proxies the mock `tonClient.getLobbyState` response today and will surface live on-chain balances/seats once the RPC hooks are real, allowing dashboards to sanity-check contract telemetry without leaving the backend.
- The frontend’s [`fetchOnchainRoundState`](./frontend/src/lib/api.ts) calls `/ton/round-state/:id` (falling back to deterministic mocks if the backend is offline) to render the “On-chain telemetry” cards inside Laboratory/Home. When `/ton/events` ingests a new winner/payout, the getter immediately reflects the updated `roundHash`, pool amounts, and participant counts that the UI displays.
