# Tonrody Contracts

This package contains the on-chain artifacts required by TONRODY. The main contract, `Tonrody.tact`, is the canonical keeper of lobby state, deposits, hash-based finalization and deterministic payouts.

## Contract overview

- **State**: stores `TonrodyConfig` (min deposit, lobby size, fee basis points, treasury address) together with the current lobby identifier, participant map, pool balance, seed commitment/reveal, computed `roundHash`, winner index and serialized transaction log.
- **Lifecycle messages**:
  - `CreateLobby(lobbyId, seedCommit, createdAt)` – resets the state and commits the fairness seed for an upcoming lobby.
  - `PayStake(lobbyId, seatIndex, memo)` – requires an attached stake `>= minDeposit`, records the participant, emits `DepositReceived` and appends a tx-log cell for audits.
  - `FinalizeRound(lobbyId, seedReveal)` – checks the reveal against the commit, builds the deterministic `roundHash`, picks the winner and emits `WinnerSelected`.
  - `WithdrawPool()` – callable only by the winner after finalization. Fees defined by `feeBps` are streamed to the treasury before sending the payout; `PayoutSent` plus the tx-log prove delivery.
- **Events** mirror the backend/webhook expectations (`DepositReceived`, `LobbyFilled`, `WinnerSelected`, `PayoutSent`). Every event is also represented in the serialized tx log stack which the backend can inspect through the `getTxLog` getter.
- **Getters**: `getConfig`, `getLobbyState`, `getParticipant(index)` and `getTxLog` expose everything the backend (or community auditors) need to reproduce the fairness proof.

## Live testnet deployment

Tonrody.tact is deployed on TON **testnet** with the exact config the backend/web clients expect:

| Item | Value |
| --- | --- |
| **Contract address** | `EQBBJBB3HagsujBqVfqeDUPJ0kXjgTPLWPFFffuNXNiJL0aA` · [Tonviewer](https://testnet.tonviewer.com/EQBBJBB3HagsujBqVfqeDUPJ0kXjgTPLWPFFffuNXNiJL0aA) · [Tonscan](https://testnet.tonscan.org/address/EQBBJBB3HagsujBqVfqeDUPJ0kXjgTPLWPFFffuNXNiJL0aA) |
| **Treasury (fee sink)** | `EQDmnxDMhId6v1Ofg_h5KR5coWlFG6e86Ro3pc7Tq4CA0-Jn` · [Tonviewer](https://testnet.tonviewer.com/EQDmnxDMhId6v1Ofg_h5KR5coWlFG6e86Ro3pc7Tq4CA0-Jn) · [Tonscan](https://testnet.tonscan.org/address/EQDmnxDMhId6v1Ofg_h5KR5coWlFG6e86Ro3pc7Tq4CA0-Jn) |
| **Network endpoint** | `https://testnet.toncenter.com/api/v2/jsonRPC` (workchain `0`, network `-3`) |
| **Config source** | `contracts/ton.config.json` (mirrors the values above so automation can read them) |

### TonrodyConfig (testnet)

| Field | Value | Notes |
| --- | --- | --- |
| `minDeposit` | `500000000` nanotons (0.5 TON) | Smallest stake required for `PayStake`.
| `lobbySize` | `3` seats | Backend marks a lobby ready when three seats are funded.
| `feeBps` | `200` (2%) | Sent to the treasury address before payouts.
| `treasury` | `EQDmnxDMhId6v1Ofg_h5KR5coWlFG6e86Ro3pc7Tq4CA0-Jn` | Receiver of fee skim and audit wallet for payouts.

The same structure is emitted by `getConfig` so backend workers can assert that Supabase values match on-chain parameters before processing a lobby.

### Build & deploy recap

1. Install the tooling inside `contracts/` (Node.js 18+):
   ```bash
   cd contracts
   npm install
   ```
2. Compile the contract to FunC/BOC via Tact:
   ```bash
   npx tact compile Tonrody.tact --config ton.config.json
   ```
   > **Note**: if `npx` fails with `403 Forbidden` inside the sandboxed environment, run the command on a workstation/CI runner with npm registry access. The generated build artifacts land in `contracts/build/` per `ton.config.json`.
3. Deploy using your preferred workflow:
   - `toncli` / `blueprint` deploy pointing to `build/Tonrody.code.boc` plus init data.
   - Manual deployment via `toncli run --testnet` or [TON CLI](https://github.com/ton-community/toncli) by uploading the `.boc` and state-init produced above.
4. After the broadcasted transaction settles, confirm the explorer shows the `EQBB…` account, then update `contracts/ton.config.json` (already committed in this repo) and share the address with the backend (`TON_CONTRACT_ADDRESS`) and frontend (`VITE_TON_CONTRACT_ADDRESS`).

### State & config verification

- `toncli run <path-to-boc> getConfig --testnet` or an RPC call to `runGetMethod` ensures the live contract returns the config table shown above. Automations should compare `minDeposit`, `lobbySize`, `feeBps` and `treasury` with Supabase before moving a lobby to `ready`.
- `getLobbyState` and `getTxLog` can be read through Toncenter/TonAPI to power `/ton/round-state/:id` and prove payouts. Both getters expose the lobby id, participant slots, pool total, commit/reveal pair and serialized audit trail.
- For manual smoke tests, trigger `PayStake`, `FinalizeRound` and `WithdrawPool` against the contract address above and confirm explorers emit `DepositReceived`, `WinnerSelected` and `PayoutSent` events under the same hashes mirrored by the backend webhooks.

Keeping these details in sync across this README and `ton.config.json` lets backend listeners, Supabase cron jobs and the frontend Ton Connect integration validate they are pointing at the same live testnet contract.

## Backend & webhook linkage

- Backend services subscribe to the address defined in `ton.config.json.networks.testnet.address` via Toncenter or your own lite-server. Each emitted event mirrors the JSON schema described in `plans.md §5` and can be stored in `tx_logs` / `audit_logs` tables.
- The serialized tx log (`getTxLog`) stores a reverse-linked list of deposits, finalization and payout entries. Webhooks can read this cell, decode it with `ton-core` and correlate with Supabase `tx_logs` for parity checks.
- The fairness hash flow mirrors the backend logic (`round_hash = sha256(lobby + seats + pool + seedReveal + participant proof)`); once the backend reveals the same seed in Supabase, the contract’s getter ensures everyone can recompute the winner.

## Local test scenarios

The `contracts/tests/tonrody.spec.ts` script uses `ton-core` to replay the lobby lifecycle with deterministic data:

- **Lobby creation** – verifies that calling `createLobby` resets participant state and commits the fairness seed.
- **Deposits** – simulates several `payStake` calls, ensuring seats cannot be double-booked and tx logs are produced.
- **Deterministic finalization** – reproduces the hash computation to confirm the winner index is stable for a given seed reveal.
- **Payouts** – enforces that only the winner can withdraw and that treasury fees are skimmed before distribution.

Run them with:
```bash
cd contracts
npm install
npm run test
```

Because the sandbox image used in this workspace blocks npm registry access, expect `npm install` (and consequently `npm run test`) to fail unless you configure a reachable registry or run the commands on your machine/CI runner.

## WebApp alignment

- Frontend Laboratory tools can hit the getters to display live lobby state, participant slots and tx logs for transparency.
- Backend cron/webhooks can ingest contract events to mark Supabase `rounds.status` as `locked/finalized/paid`.
- The deterministic serialization (seed commit/reveal, tx log cell, getters) matches the fairness proof outlined in `plans.md`, giving users everything they need to recompute `round_hash % players` off-chain.
