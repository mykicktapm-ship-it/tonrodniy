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
