import test from 'node:test';
import assert from 'node:assert/strict';
import { beginCell, Cell, Address, toNano } from 'ton-core';

interface TonrodyConfig {
  minDeposit: bigint;
  lobbySize: number;
  feeBps: number;
  treasury: Address;
}

interface ParticipantState {
  wallet: Address;
  amount: bigint;
  memo: bigint;
}

class TonrodyState {
  readonly config: TonrodyConfig;
  currentLobbyId = 0n;
  participants: Map<number, ParticipantState> = new Map();
  participantsCount = 0;
  poolAmount = 0n;
  seedCommit = 0n;
  seedReveal = 0n;
  roundHash = 0n;
  winnerIndex = -1;
  payoutSent = false;
  txLog: Cell = beginCell().endCell();
  lobbyCreatedAt = 0n;

  constructor(config: TonrodyConfig) {
    this.config = config;
  }

  createLobby(lobbyId: bigint, seedCommit: bigint, createdAt: bigint) {
    if (this.participantsCount !== 0 || this.isActive()) {
      throw new Error('LOBBY_ACTIVE');
    }
    this.currentLobbyId = lobbyId;
    this.seedCommit = seedCommit;
    this.seedReveal = 0n;
    this.roundHash = 0n;
    this.winnerIndex = -1;
    this.payoutSent = false;
    this.poolAmount = 0n;
    this.participants.clear();
    this.participantsCount = 0;
    this.txLog = beginCell().endCell();
    this.lobbyCreatedAt = createdAt;
  }

  payStake(seatIndex: number, wallet: Address, amount: bigint, memo: bigint) {
    if (!this.isActive()) throw new Error('INVALID_LOBBY');
    if (amount < this.config.minDeposit) throw new Error('INVALID_AMOUNT');
    if (seatIndex >= this.config.lobbySize) throw new Error('INVALID_SEAT');
    if (this.participants.has(seatIndex)) throw new Error('SEAT_BUSY');
    this.participants.set(seatIndex, { wallet, amount, memo });
    this.participantsCount += 1;
    this.poolAmount += amount;
    this.txLog = this.appendTxLog(1, seatIndex, wallet, amount, memo);
  }

  finalize(seedReveal: bigint) {
    if (this.participantsCount !== this.config.lobbySize) throw new Error('NOT_READY');
    if (this.winnerIndex >= 0) throw new Error('ALREADY_FINALIZED');
    if (this.shaCommit(seedReveal) !== this.seedCommit) throw new Error('INVALID_REVEAL');
    const hashSeed = this.buildHashSeed(seedReveal);
    this.roundHash = BigInt('0x' + hashSeed.hash().toString('hex'));
    this.seedReveal = seedReveal;
    this.winnerIndex = Number(this.roundHash % BigInt(this.config.lobbySize));
    this.txLog = this.appendTxLog(2, this.winnerIndex, this.lookupWinner(), this.poolAmount, seedReveal);
  }

  withdraw() {
    if (this.winnerIndex < 0) throw new Error('NOT_FINAL');
    if (this.payoutSent) throw new Error('WITHDRAWN');
    const winner = this.lookupWinner();
    if (!winner) throw new Error('NO_WINNER');
    this.payoutSent = true;
    this.txLog = this.appendTxLog(3, this.winnerIndex, winner, this.poolAmount, this.roundHash);
    return this.poolAmount - this.takeFee();
  }

  takeFee() {
    const fee = (this.poolAmount * BigInt(this.config.feeBps)) / 10_000n;
    return fee;
  }

  lookupWinner() {
    if (this.winnerIndex < 0) return undefined;
    return this.participants.get(this.winnerIndex)?.wallet;
  }

  isActive() {
    return this.currentLobbyId !== 0n && (!this.payoutSent || this.winnerIndex < 0);
  }

  buildHashSeed(seedReveal: bigint) {
    const builder = beginCell()
      .storeUint(this.currentLobbyId, 64)
      .storeUint(this.participantsCount, 16)
      .storeCoins(this.poolAmount)
      .storeUint(seedReveal, 256)
      .storeUint(this.lobbyCreatedAt, 64);
    return builder.endCell();
  }

  appendTxLog(op: number, seat: number, addr: Address | undefined, amount: bigint, aux: bigint) {
    return beginCell()
      .storeUint(op, 8)
      .storeUint(this.currentLobbyId, 64)
      .storeUint(seat, 16)
      .storeAddress(addr ?? null)
      .storeCoins(amount)
      .storeUint(aux, 256)
      .storeRef(this.txLog)
      .endCell();
  }

  shaCommit(value: bigint) {
    return BigInt('0x' + beginCell().storeUint(value, 256).endCell().hash().toString('hex'));
  }
}

const treasury = Address.parseFriendly('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c').address;

const defaultConfig: TonrodyConfig = {
  minDeposit: toNano('0.5'),
  lobbySize: 3,
  feeBps: 200,
  treasury
};

test('lobby creation resets state and commits seed', () => {
  const state = new TonrodyState(defaultConfig);
  const commit = state.shaCommit(42n);
  state.createLobby(1n, commit, 1000n);
  assert.equal(state.currentLobbyId, 1n);
  assert.equal(state.seedCommit, commit);
  assert.equal(state.participantsCount, 0);
});

test('payStake fills seats and serializes tx log', () => {
  const state = new TonrodyState(defaultConfig);
  const commit = state.shaCommit(99n);
  state.createLobby(11n, commit, 1000n);
  const wallet = Address.parseFriendly('EQD__________________________________________TON').address;
  state.payStake(0, wallet, toNano('0.7'), 111n);
  assert.equal(state.participantsCount, 1);
  assert.equal(state.poolAmount, toNano('0.7'));
  assert.ok(state.txLog.bits.length > 0);
});

test('finalize round picks deterministic winner', () => {
  const state = new TonrodyState(defaultConfig);
  const seed = 777n;
  const commit = state.shaCommit(seed);
  state.createLobby(22n, commit, 555n);
  const wallets = [0, 1, 2].map((i) => Address.parseFriendly(`EQ${'A'.repeat(43 - i)}${i}`).address);
  wallets.forEach((wallet, index) => {
    state.payStake(index, wallet, toNano('1'), BigInt(index));
  });
  state.finalize(seed);
  assert.ok(state.winnerIndex >= 0 && state.winnerIndex < defaultConfig.lobbySize);
  assert.equal(state.lookupWinner(), wallets[state.winnerIndex]);
});

test('withdraw applies fee and logs payout', () => {
  const state = new TonrodyState(defaultConfig);
  const seed = 12345n;
  const commit = state.shaCommit(seed);
  state.createLobby(99n, commit, 789n);
  const wallets = [0, 1, 2].map((i) => Address.parseFriendly(`EQ${'Z'.repeat(43 - i)}${i}`).address);
  wallets.forEach((wallet, index) => state.payStake(index, wallet, toNano('2'), BigInt(index + 1)));
  state.finalize(seed);
  const payout = state.withdraw();
  const expectedFee = (state.poolAmount * BigInt(defaultConfig.feeBps)) / 10_000n;
  assert.equal(payout, state.poolAmount - expectedFee);
  assert.ok(state.payoutSent);
});
