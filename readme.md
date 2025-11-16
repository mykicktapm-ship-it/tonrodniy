# TONRODY

TONRODY is an honest-round gaming surface defined in `plans.md`. The production execution is staged across multiple phases.

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

## Backend workspace

The mocked API + WebSocket server lives in [`backend/`](./backend/) and mirrors the routes/channel plan captured in `docs/tonrody_full_codex.md`.

### Getting started

```bash
pnpm dev:backend
```

- `pnpm dev:backend` proxies to `nodemon` with `ts-node` for instant feedback.
- `pnpm build:backend` type-checks and outputs JS to `backend/dist`.
- `pnpm start:backend` runs the compiled server (useful in production containers).

### Features

- Express app with health, lobby, user, and round routes returning schema-aligned mock data.
- Zod-backed environment loader (`backend/src/config/env.ts`) with optional multi-origin CORS configuration.
- WebSocket hub at `/ws` exposing `lobby:<id>` channels for `seat_update`, `payment_confirmed`, and `round_finalized` events.
- In-memory mock stores in `backend/src/data/` so the API surface behaves consistently until Supabase wiring lands.

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
