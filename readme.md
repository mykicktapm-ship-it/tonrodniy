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

## TON Connect

- The manifest required by wallets lives at [`frontend/public/tonconnect-manifest.json`](./frontend/public/tonconnect-manifest.json).
  Update the `url`, `name`, `iconUrl`, and `description` fields before deploying to a public host. The placeholder icon is stored
  next to it as `tonrody-icon.svg`.
- `TonConnectUIProvider` automatically loads the manifest from `${window.location.origin}/tonconnect-manifest.json`. Override the
  location by defining `VITE_TONCONNECT_MANIFEST_URL` in a `.env` file inside `frontend/`.
- The shared `<TonWalletButton />` in the header toggles wallet connections, and the Laboratory page exposes a mock
  `sendTransaction` harness that targets the placeholder round wallet defined in `src/lib/constants.ts`.
