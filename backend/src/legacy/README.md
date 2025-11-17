# Legacy mocks

The files under `backend/src/legacy/mocks` are frozen dev-only fixtures that document the original mock lobby/user payloads from early phases. Production code must not import anything from this tree; all live reads now go through Supabase and on-chain verifiers.
