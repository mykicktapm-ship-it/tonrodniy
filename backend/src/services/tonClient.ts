import TonWeb from 'tonweb';
import { beginCell, Cell } from '@ton/core';
import { sha256_sync } from '@ton/crypto';

import { env } from '../config/env';
import { getLogger } from '../utils/logger';

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

const logger = getLogger({ scope: 'tonClient', network: tonEnv.network });

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
    logger.error({ context, requiredTon, err: error }, 'wallet balance validation failed');
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
      logger.info({ txHash: fallbackHash, meta, fallback: true }, `${description} dispatched via transfer.send()`);
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
        logger.info({ txHash: response.transaction.hash, meta }, `${description} dispatched via sendBocReturnHash`);
        return response.transaction.hash;
      }
      if (response?.hash) {
        logger.info({ txHash: response.hash, meta }, `${description} dispatched via sendBocReturnHash`);
        return response.hash;
      }
    }

    await tonweb.provider.sendBoc(bocBuffer);
    logger.info({ txHash, meta }, `${description} dispatched`);
    return txHash;
  } catch (error) {
    logger.error({ amountTon, meta, err: error }, `${description} failed`);
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
      logger.warn({ method, exitCode }, 'getter returned non-zero exit code');
      return undefined;
    }
    return response?.stack as TonStackEntry[] | undefined;
  } catch (error) {
    logger.warn({ method, lobbyId, err: error }, 'getter call failed');
    return undefined;
  }
};

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

    logger.info(state, 'fetched lobby state');
    return state;
  } catch (error) {
    logger.error({ lobbyId, err: error }, 'failed to fetch lobby state');
    throw error instanceof Error ? error : new Error(String(error));
  }
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
    {
      lobbyId: params.lobbyId,
      roundId: params.roundId,
      winnerWallet: params.winnerWallet,
      payoutTon: params.payoutTon
    }
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
    { lobbyId: params.lobbyId, treasuryWallet: params.treasuryWallet, withdrawableTon },
    params.treasuryWallet
  );

  return {
    txHash,
    withdrawnTon: withdrawableTon
  };
};

const normalizeTxHash = (hash?: string | null): string | null => {
  if (!hash) {
    return null;
  }
  const normalized = hash.replace(/^0x/i, '').toLowerCase();
  return `0x${normalized}`;
};

type TonTransaction = {
  hash?: string;
  in_msg?: {
    hash?: string;
    source?: string;
    value?: string | number | bigint;
    msg_data?: {
      ['@type']?: string;
      text?: string;
      body?: string;
    };
  };
};

interface VerifyStakeParams {
  txHash: string;
  lobbyId: string;
  seatId: string;
  expectedAmountTon: number;
  expectedSender?: string | null;
  expectedSeatIndex?: number;
  expectedContractAddress?: string;
}

export interface StakeVerificationResult {
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  amountTon?: number;
  sender?: string;
  reason?: string;
  payload?: Record<string, unknown>;
}

const decodeJsonPayload = (bodyBase64?: string): Record<string, unknown> | undefined => {
  if (!bodyBase64) {
    return undefined;
  }
  try {
    const cell = Cell.fromBoc(Buffer.from(bodyBase64, 'base64'))[0];
    const slice = cell.beginParse();
    if (slice.remainingBits >= 32) {
      slice.loadUint(32);
    }
    const bytesToRead = Math.floor(slice.remainingBits / 8);
    if (bytesToRead <= 0) {
      return undefined;
    }
    const buffer = slice.loadBuffer(bytesToRead);
    const json = buffer.toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch (error) {
    logger.warn({ err: error }, 'failed to decode json payload');
    return undefined;
  }
};

const formatTonAmount = (value?: string | number | bigint): number => {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === 'bigint') {
    return nanoToTon(value);
  }
  if (typeof value === 'number') {
    return nanoToTon(BigInt(Math.trunc(value)));
  }
  return nanoToTon(BigInt(value));
};

export const verifyStakeTx = async (params: VerifyStakeParams): Promise<StakeVerificationResult> => {
  const normalizedHash = normalizeTxHash(params.txHash);
  if (!normalizedHash) {
    return {
      txHash: params.txHash,
      status: 'failed',
      reason: 'invalid_hash'
    };
  }

  try {
    const address = normalizeAddress(params.expectedContractAddress ?? tonEnv.contractAddress);
    const provider = tonweb.provider as unknown as {
      getTransactions: (address: string, limit: number) => Promise<unknown[]>;
    };
    const transactions = (await provider.getTransactions(address, 32)) as TonTransaction[];
    const candidate = transactions.find((tx) => normalizeTxHash(tx.in_msg?.hash ?? tx.hash) === normalizedHash);
    if (!candidate) {
      return {
        txHash: normalizedHash,
        status: 'pending',
        reason: 'not_found'
      };
    }

    const sender = candidate.in_msg?.source ? normalizeAddress(candidate.in_msg.source) : undefined;
    const amountTon = formatTonAmount(candidate.in_msg?.value);
    const payload = decodeJsonPayload(candidate.in_msg?.msg_data?.body);
    const lobbyMatch = payload?.lobbyId?.toString() === params.lobbyId;
    const seatMatch =
      payload?.seatId === params.seatId ||
      (params.expectedSeatIndex !== undefined && payload?.seatIndex === params.expectedSeatIndex);
    const senderMatch =
      !params.expectedSender || !sender || normalizeAddress(params.expectedSender) === normalizeAddress(sender);
    const amountMatch = amountTon >= params.expectedAmountTon;

    if (!lobbyMatch || !seatMatch) {
      return {
        txHash: normalizedHash,
        status: 'failed',
        amountTon,
        sender,
        payload,
        reason: 'payload_mismatch'
      };
    }

    if (!senderMatch) {
      return {
        txHash: normalizedHash,
        status: 'failed',
        amountTon,
        sender,
        payload,
        reason: 'sender_mismatch'
      };
    }

    if (!amountMatch) {
      return {
        txHash: normalizedHash,
        status: 'failed',
        amountTon,
        sender,
        payload,
        reason: 'insufficient_amount'
      };
    }

    return {
      txHash: normalizedHash,
      status: 'confirmed',
      amountTon,
      sender,
      payload
    };
  } catch (error) {
    logger.warn({ err: error }, 'verifyStakeTx failed');
    return {
      txHash: normalizedHash,
      status: 'pending',
      reason: 'rpc_error'
    };
  }
};

export const checkTonRpcHealth = async (): Promise<boolean> => {
  try {
    await tonweb.provider.getAddressInfo(contractAddressFriendly);
    return true;
  } catch (error) {
    logger.warn({ err: error }, 'ton rpc health failed');
    return false;
  }
};
