import { createHash, randomUUID } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';

import { env } from '../config/env';
import { auditLogStore, roundStore, SeatRow, seatStore, txLogStore } from '../db/supabase';
import { getLobbyState } from '../services/tonClient';
import {
  buildSeatTimerTickPayload,
  emitPaymentConfirmed,
  emitPayoutSent,
  emitRoundFinalized,
  emitSeatUpdate,
  emitTimerTick,
  type SeatTimerSnapshot
} from '../ws';

/**
 * TON contract event schema expected by the backend webhook:
 *
 * DepositReceived
 *   - lobbyId (number | string): Identifier of the lobby on-chain.
 *   - seatIndex/index (number): Zero-based seat index within the lobby.
 *   - sender/addr (string): Wallet address that sent the stake.
 *   - amount (number | string | bigint): Deposit amount in nanoton (1e9 = 1 TON).
 *   - memo (optional number | string): Arbitrary memo emitted with the deposit.
 *   - txHash (string): Transaction hash of the deposit message.
 *   - eventId/occurredAt/timestamp (optional): Telemetry metadata for audits.
 *
 * LobbyFilled
 *   - lobbyId (number | string): Same as above.
 *   - pool/total (number | string): Total pooled stake in nanoton.
 *   - participantsCount (number): Seats that have been paid on-chain.
 *
 * WinnerSelected
 *   - lobbyId (number | string)
 *   - winnerAddr (string): Wallet that the contract selected as winner.
 *   - payout (number | string): Total payout (nanoton).
 *   - roundHash (string, optional): Hash that proves the fairness draw.
 *
 * PayoutSent
 *   - lobbyId (number | string)
 *   - winnerAddr (string)
 *   - payout (number | string)
 *   - success (boolean): Whether the payout transfer succeeded on-chain.
 *   - txHash (string, optional): Transfer transaction hash.
 */

const tonWebhookRouter = Router();

const numericValueSchema = z.union([z.string(), z.number(), z.bigint()]);
type NumericValue = z.infer<typeof numericValueSchema>;
const optionalTimestampSchema = z.union([z.string(), z.number()]).optional();

type ContractEventType = 'DepositReceived' | 'LobbyFilled' | 'WinnerSelected' | 'PayoutSent';

const depositSchema = z
  .object({
    type: z.literal('DepositReceived'),
    lobbyId: numericValueSchema,
    seatIndex: numericValueSchema.optional(),
    index: numericValueSchema.optional(),
    seatId: z.string().optional(),
    sender: z.string().optional(),
    addr: z.string().optional(),
    amount: numericValueSchema,
    memo: numericValueSchema.optional(),
    txHash: z.string().optional(),
    eventId: z.string().optional(),
    occurredAt: optionalTimestampSchema,
    timestamp: optionalTimestampSchema
  })
  .passthrough();

const lobbyFilledSchema = z
  .object({
    type: z.literal('LobbyFilled'),
    lobbyId: numericValueSchema,
    pool: numericValueSchema.optional(),
    total: numericValueSchema.optional(),
    participantsCount: z.number().optional(),
    eventId: z.string().optional(),
    occurredAt: optionalTimestampSchema,
    timestamp: optionalTimestampSchema
  })
  .passthrough();

const winnerSelectedSchema = z
  .object({
    type: z.literal('WinnerSelected'),
    lobbyId: numericValueSchema,
    winnerAddr: z.string(),
    payout: numericValueSchema,
    roundHash: z.string().optional(),
    txHash: z.string().optional(),
    eventId: z.string().optional(),
    occurredAt: optionalTimestampSchema,
    timestamp: optionalTimestampSchema
  })
  .passthrough();

const payoutSentSchema = z
  .object({
    type: z.literal('PayoutSent'),
    lobbyId: numericValueSchema,
    winnerAddr: z.string(),
    payout: numericValueSchema,
    success: z.boolean(),
    txHash: z.string().optional(),
    eventId: z.string().optional(),
    occurredAt: optionalTimestampSchema,
    timestamp: optionalTimestampSchema
  })
  .passthrough();

const tonEventSchema = z.discriminatedUnion('type', [
  depositSchema,
  lobbyFilledSchema,
  winnerSelectedSchema,
  payoutSentSchema
]);

const tonEventsSchema = z.array(tonEventSchema);
type TonEventInput = z.infer<typeof tonEventSchema>;

const NANO_IN_TON = 1_000_000_000n;
const RESERVATION_WINDOW_MS = 2 * 60 * 1000;

type JsonRecord = Record<string, unknown>;

interface BaseEvent {
  type: ContractEventType;
  eventId: string;
  lobbyId: string;
  occurredAtIso?: string;
  raw: JsonRecord;
}

interface DepositReceivedEvent extends BaseEvent {
  type: 'DepositReceived';
  seatIndex: number;
  seatId?: string;
  sender: string;
  amountNano: bigint;
  amountTon: number;
  memo?: string;
  txHash?: string;
}

interface LobbyFilledEvent extends BaseEvent {
  type: 'LobbyFilled';
  poolNano: bigint;
  poolTon: number;
  participantsCount?: number;
}

interface WinnerSelectedEvent extends BaseEvent {
  type: 'WinnerSelected';
  winnerAddr: string;
  payoutNano: bigint;
  payoutTon: number;
  roundHash?: string;
  txHash?: string;
}

interface PayoutSentEvent extends BaseEvent {
  type: 'PayoutSent';
  winnerAddr: string;
  payoutNano: bigint;
  payoutTon: number;
  success: boolean;
  txHash?: string;
}

type TonWebhookEvent =
  | DepositReceivedEvent
  | LobbyFilledEvent
  | WinnerSelectedEvent
  | PayoutSentEvent;

type Receipt = {
  eventId: string;
  lobbyId: string;
  type: ContractEventType;
  status: 'persisted' | 'error';
  persisted?: Record<string, unknown>;
  error?: string;
};

const normalizeEvents = (raw: unknown): unknown[] => {
  if (!raw) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw === 'object' && Array.isArray((raw as { events?: unknown[] }).events)) {
    return ((raw as { events: unknown[] }).events ?? []) as unknown[];
  }
  return [raw];
};

const toLobbyId = (value: NumericValue): string => value.toString();

const toSeatIndex = (value?: NumericValue): number => {
  if (value === undefined || value === null) {
    throw new Error('Seat index is required for DepositReceived events');
  }
  const seatIndex = Number(value);
  if (!Number.isFinite(seatIndex) || seatIndex < 0) {
    throw new Error(`Invalid seat index: ${value}`);
  }
  return seatIndex;
};

const toBigIntValue = (value: NumericValue | undefined, field: string): bigint => {
  if (value === undefined || value === null) {
    throw new Error(`Missing ${field}`);
  }
  try {
    if (typeof value === 'bigint') {
      return value;
    }
    if (typeof value === 'number') {
      return BigInt(Math.trunc(value));
    }
    return BigInt(value);
  } catch (error) {
    throw new Error(`Invalid ${field}: ${String(error)}`);
  }
};

const toIsoTimestamp = (value?: string | number): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'number') {
    const millis = value > 1e12 ? value : value * 1000;
    return new Date(millis).toISOString();
  }
  const direct = Date.parse(value);
  if (!Number.isNaN(direct)) {
    return new Date(direct).toISOString();
  }
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) {
    const millis = numeric > 1e12 ? numeric : numeric * 1000;
    return new Date(millis).toISOString();
  }
  return undefined;
};

const formatTonValue = (nano: bigint): number => Number(nano) / Number(NANO_IN_TON);

const sanitizeRecord = (value: unknown): JsonRecord => {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const traverse = (input: unknown): unknown => {
    if (typeof input === 'bigint') {
      return input.toString();
    }
    if (Array.isArray(input)) {
      return input.map((entry) => traverse(entry));
    }
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>).map(([key, entry]) => [key, traverse(entry)])
      );
    }
    return input;
  };
  return traverse(value) as JsonRecord;
};

const normalizeEvent = (event: TonEventInput): TonWebhookEvent => {
  const base: BaseEvent = {
    type: event.type,
    eventId: event.eventId ?? ('txHash' in event && event.txHash ? event.txHash : randomUUID()),
    lobbyId: toLobbyId(event.lobbyId),
    occurredAtIso: toIsoTimestamp('occurredAt' in event ? event.occurredAt : undefined) ??
      toIsoTimestamp('timestamp' in event ? event.timestamp : undefined),
    raw: sanitizeRecord(event)
  };

  switch (event.type) {
    case 'DepositReceived': {
      const amountNano = toBigIntValue(event.amount, 'amount');
      return {
        ...base,
        type: 'DepositReceived',
        seatIndex: toSeatIndex(event.seatIndex ?? event.index),
        seatId: event.seatId,
        sender: event.sender ?? event.addr ?? 'unknown',
        amountNano,
        amountTon: formatTonValue(amountNano),
        memo: event.memo?.toString(),
        txHash: event.txHash
      };
    }
    case 'LobbyFilled': {
      const poolValue = toBigIntValue(event.pool ?? event.total, 'pool');
      return {
        ...base,
        type: 'LobbyFilled',
        poolNano: poolValue,
        poolTon: formatTonValue(poolValue),
        participantsCount: event.participantsCount
      };
    }
    case 'WinnerSelected': {
      const payoutNano = toBigIntValue(event.payout, 'payout');
      return {
        ...base,
        type: 'WinnerSelected',
        winnerAddr: event.winnerAddr,
        payoutNano,
        payoutTon: formatTonValue(payoutNano),
        roundHash: event.roundHash,
        txHash: event.txHash
      };
    }
    case 'PayoutSent': {
      const payoutNano = toBigIntValue(event.payout, 'payout');
      return {
        ...base,
        type: 'PayoutSent',
        winnerAddr: event.winnerAddr,
        payoutNano,
        payoutTon: formatTonValue(payoutNano),
        success: event.success,
        txHash: event.txHash
      };
    }
    default:
      throw new Error(`Unsupported event type ${(event as { type?: string }).type}`);
  }
};

const parseEvents = (raw: unknown): TonWebhookEvent[] => {
  const normalized = normalizeEvents(raw);
  if (!normalized.length) {
    return [];
  }
  const parsed = tonEventsSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new Error(parsed.error.errors.map((issue) => issue.message).join('; '));
  }
  return parsed.data.map((event) => normalizeEvent(event));
};

const validateSecret = (provided?: string | null) => provided === env.tonWebhookSecret;

const getSeatExpiration = (seat: SeatRow): string | undefined => {
  if (!seat.taken_at || seat.status === 'paid') {
    return undefined;
  }
  const timestamp = Date.parse(seat.taken_at);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }
  return new Date(timestamp + RESERVATION_WINDOW_MS).toISOString();
};

interface SeatBroadcastPayload extends SeatTimerSnapshot {
  id: string;
  seatIndex: number;
  status: string;
  userId?: string;
  reservedAt?: string;
  paidAt?: string;
  expiresAt?: string;
  txHash?: string;
}

const buildSeatPayload = (seat: SeatRow, txHash?: string): SeatBroadcastPayload => ({
  id: seat.id,
  seatIndex: seat.seat_index,
  status: seat.status,
  userId: seat.user_id ?? undefined,
  reservedAt: seat.taken_at ?? undefined,
  paidAt: seat.paid_at ?? undefined,
  expiresAt: getSeatExpiration(seat),
  txHash: txHash ?? undefined
});

const recordAuditTrail = async (event: TonWebhookEvent) => {
  const digest = createHash('sha256')
    .update([event.type, event.lobbyId, event.eventId, event.occurredAtIso ?? ''].join(':'))
    .digest('hex');
  return auditLogStore.insert({
    actorType: 'contract',
    actorId: env.tonContractAddress,
    action: event.type,
    payload: {
      lobbyId: event.lobbyId,
      eventId: event.eventId,
      occurredAt: event.occurredAtIso,
      data: event.raw
    },
    hash: digest
  });
};

const findSeatForDeposit = async (event: DepositReceivedEvent): Promise<SeatRow> => {
  if (event.seatId) {
    const seat = await seatStore.findById(event.seatId);
    if (seat) {
      return seat;
    }
  }
  const seat = await seatStore.findByLobbyAndIndex(event.lobbyId, event.seatIndex);
  if (!seat) {
    throw new Error(`Seat ${event.seatIndex} not found in lobby ${event.lobbyId}`);
  }
  return seat;
};

const getLatestRoundForLobby = async (lobbyId: string) => {
  const roundMap = await roundStore.getLatestByLobbyIds([lobbyId]);
  const round = roundMap.get(lobbyId);
  if (!round) {
    throw new Error(`Round not found for lobby ${lobbyId}`);
  }
  return round;
};

const handleDepositReceived = async (event: DepositReceivedEvent) => {
  const seat = await findSeatForDeposit(event);
  const shouldUpdateSeat = seat.status !== 'paid';
  const paidSeat = shouldUpdateSeat
    ? await seatStore.markPaid(seat.id, event.amountTon, event.occurredAtIso ?? new Date().toISOString())
    : seat;
  const txLog = await txLogStore.insert({
    userId: paidSeat.user_id ?? undefined,
    lobbyId: event.lobbyId,
    seatId: paidSeat.id,
    action: 'pay',
    txHash: event.txHash,
    amountTon: event.amountTon,
    status: 'confirmed',
    metadata: {
      source: 'ton_webhook',
      eventType: event.type,
      seatIndex: paidSeat.seat_index,
      sender: event.sender,
      occurredAt: event.occurredAtIso,
      memo: event.memo
    }
  });
  const audit = await recordAuditTrail(event);
  const seatPayload = buildSeatPayload(paidSeat, txLog.tx_hash ?? event.txHash);
  emitSeatUpdate({ lobbyId: event.lobbyId, seat: seatPayload });
  emitPaymentConfirmed({
    lobbyId: event.lobbyId,
    seat: seatPayload,
    txHash: txLog.tx_hash ?? event.txHash
  });
  emitTimerTick(buildSeatTimerTickPayload(event.lobbyId, seatPayload));
  return { auditLogId: audit.id, txLogId: txLog.id, seatId: paidSeat.id };
};

const handleLobbyFilled = async (event: LobbyFilledEvent) => {
  const audit = await recordAuditTrail(event);
  return { auditLogId: audit.id, poolTon: event.poolTon, participantsCount: event.participantsCount };
};

const handleWinnerSelected = async (event: WinnerSelectedEvent) => {
  const round = await getLatestRoundForLobby(event.lobbyId);
  const updatedRound = await roundStore.update(round.id, {
    winner_wallet: event.winnerAddr,
    payout_amount: event.payoutTon,
    finalized_at: event.occurredAtIso ?? round.finalized_at ?? new Date().toISOString(),
    round_hash: event.roundHash ?? round.round_hash
  });
  const txLog = await txLogStore.insert({
    lobbyId: event.lobbyId,
    action: 'result',
    amountTon: event.payoutTon,
    status: 'confirmed',
    metadata: {
      source: 'ton_webhook',
      eventType: event.type,
      winnerWallet: event.winnerAddr,
      roundId: updatedRound.id,
      roundHash: updatedRound.round_hash
    }
  });
  const audit = await recordAuditTrail(event);
  emitRoundFinalized({
    lobbyId: event.lobbyId,
    roundId: updatedRound.id,
    winnerWallet: event.winnerAddr,
    payoutTon: event.payoutTon,
    roundHash: updatedRound.round_hash
  });
  return { auditLogId: audit.id, txLogId: txLog.id, roundId: updatedRound.id };
};

const handlePayoutSent = async (event: PayoutSentEvent) => {
  const round = await getLatestRoundForLobby(event.lobbyId);
  const updatedRound = await roundStore.update(round.id, {
    payout_amount: event.payoutTon,
    finalized_at: round.finalized_at ?? event.occurredAtIso ?? new Date().toISOString(),
    tx_hash: event.txHash ?? round.tx_hash
  });
  const txLog = await txLogStore.insert({
    lobbyId: event.lobbyId,
    action: 'payout',
    txHash: event.txHash,
    amountTon: event.payoutTon,
    status: event.success ? 'confirmed' : 'failed',
    metadata: {
      source: 'ton_webhook',
      eventType: event.type,
      roundId: updatedRound.id,
      winnerWallet: event.winnerAddr,
      success: event.success
    }
  });
  const audit = await recordAuditTrail(event);
  emitPayoutSent({
    lobbyId: event.lobbyId,
    roundId: updatedRound.id,
    winnerWallet: event.winnerAddr,
    payoutTon: event.payoutTon,
    txHash: event.txHash,
    success: event.success
  });
  return { auditLogId: audit.id, txLogId: txLog.id, roundId: updatedRound.id };
};

const handleEvent = async (event: TonWebhookEvent) => {
  switch (event.type) {
    case 'DepositReceived':
      return handleDepositReceived(event);
    case 'LobbyFilled':
      return handleLobbyFilled(event);
    case 'WinnerSelected':
      return handleWinnerSelected(event);
    case 'PayoutSent':
      return handlePayoutSent(event);
    default:
      throw new Error(`Unhandled event ${event.type}`);
  }
};

tonWebhookRouter.post('/events', async (req, res) => {
  const secret = req.get('x-ton-webhook-secret') ?? (req.query.secret as string | undefined);
  if (!validateSecret(secret)) {
    return res.status(401).json({ error: 'invalid webhook secret' });
  }

  let events: TonWebhookEvent[] = [];
  try {
    events = parseEvents(req.body);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }

  if (!events.length) {
    return res.status(400).json({ error: 'no recognizable TON events' });
  }

  const receipts: Receipt[] = [];
  for (const event of events) {
    try {
      const persisted = await handleEvent(event);
      receipts.push({
        eventId: event.eventId,
        lobbyId: event.lobbyId,
        type: event.type,
        status: 'persisted',
        persisted
      });
    } catch (error) {
      receipts.push({
        eventId: event.eventId,
        lobbyId: event.lobbyId,
        type: event.type,
        status: 'error',
        error: (error as Error).message
      });
    }
  }

  res.json({ received: events.length, receipts });
});

// lightweight proxy to surface mock tonClient state for dev dashboards
tonWebhookRouter.get('/round-state/:id', async (req, res) => {
  try {
    const lobbyState = await getLobbyState(req.params.id);
    res.json({ lobbyState });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export { tonWebhookRouter };
