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

## Building & deploying

1. Install the tooling inside `contracts/` (any Node.js 18+ runtime is sufficient):
   ```bash
   cd contracts
   npm install
   ```
2. Compile the contract to FunC/BOC via Tact:
   ```bash
   npx tact compile Tonrody.tact --config ton.config.json
   ```
   > **Note**: if `npx` fails with `403 Forbidden` inside the sandboxed environment, set up Tact locally or inside CI where npm has registry access. The generated build artifacts land in `contracts/build/` as configured in `ton.config.json`.
3. Deploy with your preferred workflow:
   - `toncli` / `blueprint` deploy task pointing to `contracts/ton.config.json`.
   - Manual deployment by pushing the compiled `.boc` plus init data through `toncli run --testnet` or [TON CLI](https://github.com/ton-community/toncli).

`contracts/ton.config.json` ships with a reference **testnet** address placeholder (`0QDjTonRodyLobbySeed…`). Update it with the actual address returned by your deployment transaction and commit the change so the backend/webhook layer can subscribe to the right account.

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
