import { randomUUID } from 'crypto';
import { Router } from 'express';
import { env } from '../config/env';
import { appendTxLog } from '../data/txLogs';
import { getRoundById } from '../data/rounds';
import { TonWebhookEventType, TxLog } from '../data/types';
import { getLobbyState } from '../services/tonClient';

interface TonWebhookBase {
  type: TonWebhookEventType;
  eventId?: string;
  lobbyId: string;
  roundId?: string;
  occurredAt?: string;
}

interface DepositReceivedPayload extends TonWebhookBase {
  type: 'DepositReceived';
  txHash: string;
  amountTon: number;
  senderWallet: string;
  seatId?: string;
  metadata?: Record<string, unknown>;
}

interface WinnerSelectedPayload extends TonWebhookBase {
  type: 'WinnerSelected';
  roundHash?: string;
  txHash?: string;
  winnerWallet: string;
  winnerUserId?: string;
  payoutTon?: number;
}

interface PayoutSentPayload extends TonWebhookBase {
  type: 'PayoutSent';
  txHash: string;
  payoutTon: number;
  recipientWallet: string;
}

type TonWebhookEvent = DepositReceivedPayload | WinnerSelectedPayload | PayoutSentPayload;

const tonWebhookRouter = Router();

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

const allowedEventTypes: TonWebhookEventType[] = ['DepositReceived', 'WinnerSelected', 'PayoutSent'];

const isTonEvent = (event: unknown): event is TonWebhookEvent => {
  if (!event || typeof event !== 'object') {
    return false;
  }
  const candidate = event as Partial<TonWebhookEvent>;
  return Boolean(
    candidate.type && allowedEventTypes.includes(candidate.type) && typeof candidate.lobbyId === 'string'
  );
};

const validateSecret = (provided?: string | null) => provided === env.tonWebhookSecret;

const persistTxLog = (event: TonWebhookEvent, overrides?: Partial<TxLog>) => {
  const txLog: TxLog = {
    id: event.eventId ?? randomUUID(),
    lobbyId: event.lobbyId,
    roundId: event.roundId,
    txHash: 'txHash' in event ? event.txHash : undefined,
    wallet:
      'senderWallet' in event
        ? event.senderWallet
        : 'recipientWallet' in event
          ? event.recipientWallet
          : 'winnerWallet' in event
            ? event.winnerWallet
            : undefined,
    amountTon:
      'amountTon' in event
        ? event.amountTon
        : 'payoutTon' in event
          ? event.payoutTon
          : undefined,
    eventType: event.type,
    payload: event as unknown as Record<string, unknown>,
    createdAt: event.occurredAt ?? new Date().toISOString(),
    ...overrides
  };
  return appendTxLog(txLog);
};

const handleDepositReceived = (event: DepositReceivedPayload) => {
  const round = event.roundId ? getRoundById(event.roundId) : undefined;
  if (round && !round.txHashes.includes(event.txHash)) {
    round.txHashes.push(event.txHash);
  }
  persistTxLog(event);
  return { handled: true };
};

const handleWinnerSelected = (event: WinnerSelectedPayload) => {
  const round = event.roundId ? getRoundById(event.roundId) : undefined;
  if (round) {
    round.roundHash = event.roundHash ?? round.roundHash;
    round.winnerWallet = event.winnerWallet ?? round.winnerWallet;
    round.winnerUserId = event.winnerUserId ?? round.winnerUserId;
    round.payoutAmount = event.payoutTon ?? round.payoutAmount;
    if (event.txHash && !round.txHashes.includes(event.txHash)) {
      round.txHashes.push(event.txHash);
    }
  }
  persistTxLog(event);
  return { handled: Boolean(round) };
};

const handlePayoutSent = (event: PayoutSentPayload) => {
  const round = event.roundId ? getRoundById(event.roundId) : undefined;
  if (round) {
    round.payoutAmount = event.payoutTon;
    if (!round.txHashes.includes(event.txHash)) {
      round.txHashes.push(event.txHash);
    }
  }
  persistTxLog(event);
  return { handled: Boolean(round) };
};

const handleEvent = (event: TonWebhookEvent) => {
  switch (event.type) {
    case 'DepositReceived':
      return handleDepositReceived(event);
    case 'WinnerSelected':
      return handleWinnerSelected(event);
    case 'PayoutSent':
      return handlePayoutSent(event);
    default:
      return { handled: false };
  }
};

tonWebhookRouter.post('/events', (req, res) => {
  const secret = req.get('x-ton-webhook-secret') ?? (req.query.secret as string | undefined);
  if (!validateSecret(secret)) {
    return res.status(401).json({ error: 'invalid webhook secret' });
  }

  const events = normalizeEvents(req.body).filter((event): event is TonWebhookEvent => isTonEvent(event));

  if (!events.length) {
    return res.status(400).json({ error: 'no recognizable TON events' });
  }

  const receipts = events.map((event) => ({ eventId: event.eventId, type: event.type, ...handleEvent(event) }));

  res.json({ received: receipts.length, receipts });
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
