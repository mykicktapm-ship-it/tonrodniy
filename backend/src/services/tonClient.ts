import TonWeb from 'tonweb';
import { beginCell, Cell } from '@ton/core';
import { sha256_sync } from '@ton/crypto';

import { env } from '../config/env';

const tonEnv = env.ton;

type TonEventType = 'DepositReceived' | 'WinnerSelected' | 'PayoutSent';

type TonStackEntry = [string, any];

interface OperatorKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

const EVENT_TYPES: TonEventType[] = ['DepositReceived', 'WinnerSelected', 'PayoutSent'];
const GAS_BUFFER_TON = {
  stake: 0.05,
  finalize: 0.06,
  withdraw: 0.05
};
const OPCODES = {
  payStake: 0x50595354, // 'PYST'
  finalizeRound: 0x46494e4c, // 'FINL'
  withdrawPool: 0x5750544c // 'WPTL'
} as const;
const NANO_IN_TON = 1_000_000_000n;

const httpProviderOptions = tonEnv.apiKey ? { apiKey: tonEnv.apiKey } : undefined;
const httpProvider = new TonWeb.HttpProvider(tonEnv.rpcUrl, httpProviderOptions);
const tonweb = new TonWeb(httpProvider);
const WalletClass = tonweb.wallet?.all?.v4R2 ?? TonWeb.wallet?.all?.v4R2;

if (!WalletClass) {
  throw new Error('TonWeb Wallet v4R2 implementation is not available');
}

const operatorKeyPair = deriveKeyPair();
const operatorWallet = new WalletClass(httpProvider, {
  publicKey: operatorKeyPair.publicKey,
  wc: 0
});
const operatorWalletAddressPromise = operatorWallet.getAddress();

const logger = (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => {
  const payload = {
    scope: 'tonClient',
    network: tonEnv.network,
    ...meta
  };
  const target = console[level] ?? console.log;
  target(`[tonClient] ${message}`, payload);
};

export interface LobbyState {
  lobbyId: string;
  roundId: string;
  onChainBalanceTon: number;
  lockedStakeTon: number;
  lastRoundHash: string;
  seatsPaid: number;
  seatsTotal: number;
  lastEventType?: TonEventType;
  updatedAt: string;
}

export interface PayStakeRequest {
  lobbyId: string;
  seatId: string;
  participantWallet: string;
  amountTon: number;
}

export interface PayStakeResponse {
  txHash: string;
  status: 'accepted' | 'rejected';
  simulated: boolean;
}

export interface FinalizeRoundRequest {
  lobbyId: string;
  roundId: string;
  winnerWallet?: string;
  payoutTon?: number;
}

export interface FinalizeRoundResponse {
  roundHash: string;
  winnerWallet?: string;
  payoutTon?: number;
  txHash: string;
}

export interface WithdrawPoolRequest {
  lobbyId: string;
  treasuryWallet: string;
}

export interface WithdrawPoolResponse {
  txHash: string;
  withdrawnTon: number;
}

const hexToBytes = (value: string): Uint8Array => {
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (normalized.length % 2 !== 0) {
    throw new Error('Hex value must have an even number of characters');
  }
  return Uint8Array.from(Buffer.from(normalized, 'hex'));
};

function deriveKeyPair(): OperatorKeyPair {
  const publicKey = hexToBytes(tonEnv.deployerPublicKey);
  if (publicKey.length !== 32) {
    throw new Error('TON_DEPLOYER_PUBLIC_KEY must represent 32 bytes');
  }
  const secretKeyRaw = hexToBytes(tonEnv.deployerPrivateKey);
  if (secretKeyRaw.length !== 32 && secretKeyRaw.length !== 64) {
    throw new Error('TON_DEPLOYER_PRIVATE_KEY must represent 32 or 64 bytes');
  }
  const secretKey = secretKeyRaw.length === 64 ? secretKeyRaw : concatSecret(publicKey, secretKeyRaw);
  return { publicKey, secretKey };
}

const concatSecret = (publicKey: Uint8Array, secret: Uint8Array): Uint8Array => {
  const combined = new Uint8Array(64);
  combined.set(secret);
  combined.set(publicKey, 32);
  return combined;
};

const normalizeAddress = (address: string): string => {
  const tonAddress = new TonWeb.utils.Address(address);
  return tonAddress.toString(true, true, true);
};

const contractAddressFriendly = normalizeAddress(tonEnv.contractAddress);

const tonToNano = (tonValue: number): bigint => {
  if (!Number.isFinite(tonValue) || tonValue <= 0) {
    throw new Error(`Invalid TON value: ${tonValue}`);
  }
  const normalized = tonValue.toFixed(9);
  const [whole, fractional = ''] = normalized.split('.');
  const paddedFractional = `${fractional}000000000`.slice(0, 9);
  return BigInt(`${whole}${paddedFractional}`);
};

const nanoToTon = (value: string | number | bigint): number => {
  const bigIntValue = typeof value === 'bigint' ? value : BigInt(value);
  return Number(bigIntValue) / Number(NANO_IN_TON);
};

const toBnAmount = (tonValue: number) => {
  const nano = tonToNano(tonValue);
  return new TonWeb.utils.BN(nano.toString());
};

const toTonWebCell = (cell: Cell) => {
  const boc = cell.toBoc({ idx: false });
  return TonWeb.boc?.Cell?.oneFromBoc ? TonWeb.boc.Cell.oneFromBoc(boc) : boc;
};

const encodeJsonPayload = (opCode: number, payload: Record<string, unknown>): Cell => {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  return beginCell().storeUint(opCode, 32).storeBuffer(body).endCell();
};

const getCellPayloadBuffer = (entry?: TonStackEntry): Buffer | undefined => {
  if (!entry) return undefined;
  const [type, value] = entry;
  if (type !== 'cell' && type !== 'tvm.Cell') {
    return undefined;
  }
  if (!value || typeof value.bytes !== 'string') {
    return undefined;
  }
  const boc = Buffer.from(value.bytes, 'base64');
  const cell = Cell.fromBoc(boc)[0];
  const slice = cell.beginParse();
  const bytesToRead = Math.floor(slice.remainingBits / 8);
  if (bytesToRead <= 0) {
    return Buffer.alloc(0);
  }
  const buffer = slice.loadBuffer(bytesToRead);
  return Buffer.from(buffer);
};

const parseStackBigInt = (entry?: TonStackEntry): bigint => {
  if (!entry) return 0n;
  const [type, value] = entry;
  if (type === 'num' || type === 'int') {
    if (typeof value === 'string') {
      return value.startsWith('0x') ? BigInt(value) : BigInt(value);
    }
    if (typeof value === 'number') {
      return BigInt(value);
    }
  }
  if (type === 'tvm.tuple' && Array.isArray(value)) {
    return parseStackBigInt(value[0] as TonStackEntry);
  }
  return 0n;
};

const parseStackString = (entry?: TonStackEntry): string | undefined => {
  const buffer = getCellPayloadBuffer(entry);
  return buffer ? buffer.toString('utf8').replace(/\0+$/u, '') : undefined;
};

const parseStackHex = (entry?: TonStackEntry): string | undefined => {
  const buffer = getCellPayloadBuffer(entry);
  return buffer ? `0x${buffer.toString('hex')}` : undefined;
};

const ensureWalletBudget = async (requiredTon: number, context: string) => {
  try {
    const walletAddress = await operatorWalletAddressPromise;
    const friendly = walletAddress.toString(true, true, true);
    const info = await tonweb.provider.getAddressInfo(friendly);
    const balanceTon = nanoToTon(info?.balance ?? '0');
    if (balanceTon < requiredTon) {
      throw new Error(
        `Insufficient deployer balance for ${context}. Required ${requiredTon} TON, available ${balanceTon} TON`
      );
    }
  } catch (error) {
    logger('error', 'wallet balance validation failed', { context, requiredTon, error });
    throw error instanceof Error ? error : new Error(String(error));
  }
};

const sendContractMessage = async (
  description: string,
  amountTon: number,
  payload: Cell,
  meta?: Record<string, unknown>,
  destinationAddress = contractAddressFriendly
): Promise<string> => {
  try {
    const seqnoRaw = await operatorWallet.methods.seqno().call();
    const seqno = typeof seqnoRaw === 'number' ? seqnoRaw : Number(seqnoRaw);
    if (!Number.isInteger(seqno)) {
      throw new Error('Unable to read deployer wallet seqno');
    }

    const transfer = operatorWallet.methods.transfer({
      secretKey: operatorKeyPair.secretKey,
      toAddress: destinationAddress,
      amount: toBnAmount(amountTon),
      seqno,
      payload: toTonWebCell(payload),
      sendMode: 3
    });

    if (typeof transfer.getQuery !== 'function') {
      await transfer.send();
      const fallbackHash = Buffer.from(sha256_sync(payload.toBoc({ idx: false }))).toString('hex');
      logger('info', `${description} dispatched via transfer.send()`, { txHash: fallbackHash, meta, fallback: true });
      return fallbackHash;
    }

    const boc = await transfer.getQuery();
    const bocBuffer = typeof boc === 'string'
      ? Buffer.from(boc, 'base64')
      : Buffer.isBuffer(boc)
        ? boc
        : Buffer.from(boc);
    const txHash = Buffer.from(sha256_sync(bocBuffer)).toString('hex');

    if (typeof tonweb.provider.sendBocReturnHash === 'function') {
      const response = await tonweb.provider.sendBocReturnHash(bocBuffer);
      if (response?.transaction?.hash) {
        logger('info', `${description} dispatched via sendBocReturnHash`, { txHash: response.transaction.hash, meta });
        return response.transaction.hash;
      }
      if (response?.hash) {
        logger('info', `${description} dispatched via sendBocReturnHash`, { txHash: response.hash, meta });
        return response.hash;
      }
    }

    await tonweb.provider.sendBoc(bocBuffer);
    logger('info', `${description} dispatched`, { txHash, meta });
    return txHash;
  } catch (error) {
    logger('error', `${description} failed`, { amountTon, meta, error });
    throw error instanceof Error ? error : new Error(String(error));
  }
};

const buildLobbyArg = (lobbyId: string): TonStackEntry => {
  const cell = beginCell().storeBuffer(Buffer.from(lobbyId, 'utf8')).endCell();
  return ['tvm.Cell', { bytes: cell.toBoc({ idx: false }).toString('base64') }];
};

const runLobbyGetter = async (method: string, lobbyId: string): Promise<TonStackEntry[] | undefined> => {
  try {
    const response = await tonweb.provider.call(contractAddressFriendly, method, [buildLobbyArg(lobbyId)]);
    const exitCodeRaw = response?.exit_code ?? 0;
    const exitCode = typeof exitCodeRaw === 'string' ? Number(BigInt(exitCodeRaw)) : Number(exitCodeRaw);
    if (exitCode !== 0) {
      logger('warn', `${method} getter returned non-zero exit code`, { exitCode });
      return undefined;
    }
    return response?.stack as TonStackEntry[] | undefined;
  } catch (error) {
    logger('warn', `${method} getter call failed`, { lobbyId, error });
    return undefined;
  }
};

const buildPayStakePayload = (params: PayStakeRequest): Cell =>
  encodeJsonPayload(OPCODES.payStake, {
    lobbyId: params.lobbyId,
    seatId: params.seatId,
    participant: params.participantWallet,
    stakeTon: params.amountTon
  });

const buildFinalizePayload = (params: FinalizeRoundRequest, roundHash: string): Cell =>
  encodeJsonPayload(OPCODES.finalizeRound, {
    lobbyId: params.lobbyId,
    roundId: params.roundId,
    winnerWallet: params.winnerWallet,
    payoutTon: params.payoutTon ?? 0,
    roundHash
  });

const buildWithdrawPayload = (params: WithdrawPoolRequest, withdrawableTon: number): Cell =>
  encodeJsonPayload(OPCODES.withdrawPool, {
    lobbyId: params.lobbyId,
    treasuryWallet: normalizeAddress(params.treasuryWallet),
    withdrawableTon
  });

const computeRoundHash = (params: FinalizeRoundRequest): string => {
  const payload = `${params.lobbyId}|${params.roundId}|${params.winnerWallet ?? ''}|${params.payoutTon ?? 0}`;
  return `0x${Buffer.from(sha256_sync(Buffer.from(payload, 'utf8'))).toString('hex')}`;
};

export const getLobbyState = async (lobbyId: string): Promise<LobbyState> => {
  try {
    const [accountInfo, getterStack] = await Promise.all([
      tonweb.provider.getAddressInfo(contractAddressFriendly),
      runLobbyGetter('get_lobby_state', lobbyId)
    ]);

    const onChainBalanceTon = nanoToTon(accountInfo?.balance ?? '0');
    let roundId = `round-${lobbyId}`;
    let lockedStakeTon = 0;
    let lastRoundHash = '0x0';
    let seatsPaid = 0;
    let seatsTotal = 0;
    let lastEventType: TonEventType | undefined;

    if (Array.isArray(getterStack) && getterStack.length > 0) {
      roundId = parseStackString(getterStack[0]) ?? roundId;
      lockedStakeTon = nanoToTon(parseStackBigInt(getterStack[1]));
      lastRoundHash = parseStackHex(getterStack[2]) ?? lastRoundHash;
      seatsPaid = Number(parseStackBigInt(getterStack[3]));
      seatsTotal = Number(parseStackBigInt(getterStack[4]));
      const eventIndex = Number(parseStackBigInt(getterStack[5]));
      lastEventType = EVENT_TYPES[eventIndex] ?? undefined;
    }

    const state: LobbyState = {
      lobbyId,
      roundId,
      onChainBalanceTon,
      lockedStakeTon,
      lastRoundHash,
      seatsPaid,
      seatsTotal,
      lastEventType,
      updatedAt: new Date().toISOString()
    };

    logger('info', 'fetched lobby state', state);
    return state;
  } catch (error) {
    logger('error', 'failed to fetch lobby state', { lobbyId, error });
    throw error instanceof Error ? error : new Error(String(error));
  }
};

export const sendPayStake = async (params: PayStakeRequest): Promise<PayStakeResponse> => {
  const budgetTon = params.amountTon + GAS_BUFFER_TON.stake;
  await ensureWalletBudget(budgetTon, 'pay_stake');
  const txHash = await sendContractMessage('pay_stake', params.amountTon, buildPayStakePayload(params), params);
  return {
    txHash,
    status: 'accepted',
    simulated: false
  };
};

export const sendFinalizeRound = async (
  params: FinalizeRoundRequest
): Promise<FinalizeRoundResponse> => {
  const roundHash = computeRoundHash(params);
  await ensureWalletBudget(GAS_BUFFER_TON.finalize, 'finalize_round');
  const txHash = await sendContractMessage(
    'finalize_round',
    GAS_BUFFER_TON.finalize,
    buildFinalizePayload(params, roundHash),
    params
  );

  return {
    roundHash,
    winnerWallet: params.winnerWallet,
    payoutTon: params.payoutTon,
    txHash
  };
};

export const sendWithdrawPool = async (
  params: WithdrawPoolRequest
): Promise<WithdrawPoolResponse> => {
  const lobbyState = await getLobbyState(params.lobbyId);
  const withdrawableTon = Math.max(lobbyState.onChainBalanceTon - lobbyState.lockedStakeTon, 0);
  await ensureWalletBudget(GAS_BUFFER_TON.withdraw, 'withdraw_pool');
  const txHash = await sendContractMessage(
    'withdraw_pool',
    GAS_BUFFER_TON.withdraw,
    buildWithdrawPayload(params, withdrawableTon),
    { ...params, withdrawableTon }
  );

  return {
    txHash,
    withdrawnTon: withdrawableTon
  };
};
