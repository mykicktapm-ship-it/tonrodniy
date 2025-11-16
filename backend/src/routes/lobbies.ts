import { Router } from 'express';
import { createHash, randomBytes } from 'crypto';
import {
  auditLogStore,
  lobbyStore,
  LobbyComposite,
  SeatRow,
  numberParsers,
  roundStore,
  seatStore,
  txLogStore,
  userStore
} from '../db/supabase';
import {
  buildSeatTimerTickPayload,
  emitPaymentConfirmed,
  emitRoundFinalized,
  emitSeatUpdate,
  emitTimerTick,
  type SeatTimerSnapshot
} from '../ws';
import { sendFinalizeRound } from '../services/tonClient';

const RESERVATION_WINDOW_MS = 2 * 60 * 1000;
const PAYMENT_WINDOW_MS = 5 * 60 * 1000;

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

export interface SerializedSeatPayload extends SeatTimerSnapshot {
  id: string;
  seatIndex: number;
  status: string;
  userId?: string;
  reservedAt?: string;
  paidAt?: string;
  expiresAt?: string;
  txHash?: string;
}

const serializeSeat = (seat: SeatRow, seatTxMap: Map<string, string>): SerializedSeatPayload => ({
  id: seat.id,
  seatIndex: seat.seat_index,
  status: seat.status,
  userId: seat.user_id ?? undefined,
  reservedAt: seat.taken_at ?? undefined,
  paidAt: seat.paid_at ?? undefined,
  expiresAt: getSeatExpiration(seat),
  txHash: seatTxMap.get(seat.id) ?? undefined
});

const serializeLobby = (composite: LobbyComposite, seatTxMap: Map<string, string>) => {
  const stake = numberParsers.toNumber(composite.lobby.stake_amount) ?? 0;
  const seats = composite.seats.map((seat) => serializeSeat(seat, seatTxMap));
  const paidSeats = seats.filter((seat) => seat.status === 'paid').length;
  return {
    id: composite.lobby.id,
    lobbyCode: composite.lobby.lobby_code,
    class: composite.lobby.class,
    stake,
    seatsTotal: composite.lobby.seats_total,
    status: composite.lobby.status,
    roundWallet: composite.lobby.round_wallet,
    createdAt: composite.lobby.created_at,
    updatedAt: composite.lobby.updated_at,
    seedCommit: composite.lobby.round_seed_commit,
    seedReveal: composite.lobby.status === 'finalized' ? composite.lobby.round_seed_reveal : undefined,
    currentRoundId: composite.currentRound?.id,
    roundHash: composite.currentRound?.round_hash ?? composite.lobby.round_hash ?? undefined,
    paidSeats,
    payoutPoolTon: paidSeats * stake,
    seats
  };
};

const mapSeatTxs = async (lobbies: LobbyComposite[]): Promise<Map<string, string>> => {
  const seatIds = lobbies.flatMap((lobby) => lobby.seats.map((seat) => seat.id));
  return txLogStore.latestSeatPayments(seatIds);
};

const ensureLobbyExists = async (lobbyId: string): Promise<LobbyComposite> => {
  const lobby = await lobbyStore.getDetailed(lobbyId);
  if (!lobby) {
    throw new Error('Lobby not found');
  }
  return lobby;
};

export const lobbiesRouter = Router();

lobbiesRouter.get('/', async (_req, res) => {
  try {
    const lobbyComposites = await lobbyStore.listDetailed();
    const seatTxMap = await mapSeatTxs(lobbyComposites);
    res.json({ lobbies: lobbyComposites.map((lobby) => serializeLobby(lobby, seatTxMap)) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

lobbiesRouter.post('/', async (req, res) => {
  const { lobbyCode, lobbyClass, stakeTon, seatsTotal, roundWallet, createdBy } =
    req.body as {
      lobbyCode?: string;
      lobbyClass?: string;
      stakeTon?: number;
      seatsTotal?: number;
      roundWallet?: string;
      createdBy?: string;
    };

  if (!lobbyCode || !roundWallet) {
    return res.status(400).json({ error: 'lobbyCode and roundWallet are required' });
  }

  const stake = Number(stakeTon);
  if (!Number.isFinite(stake) || stake <= 0) {
    return res.status(400).json({ error: 'stakeTon must be a positive number' });
  }

  const seatsCount = Number(seatsTotal);
  if (!Number.isInteger(seatsCount) || seatsCount <= 0) {
    return res.status(400).json({ error: 'seatsTotal must be a positive integer' });
  }

  try {
    const existing = await lobbyStore.findByCode(lobbyCode);
    if (existing) {
      return res.status(409).json({ error: 'lobbyCode already exists' });
    }

    const seedReveal = randomBytes(32).toString('hex');
    const seedCommit = createHash('sha256').update(seedReveal).digest('hex');

    const lobbyRow = await lobbyStore.create({
      lobbyCode,
      lobbyClass: lobbyClass ?? 'standard',
      stakeAmount: stake,
      seatsTotal: seatsCount,
      roundWallet,
      seedCommit,
      createdBy: createdBy ?? null
    });
    await seatStore.createBatch(lobbyRow.id, seatsCount);
    await roundStore.create(lobbyRow.id, 1);
    await auditLogStore.recordSeedCommit({
      lobbyId: lobbyRow.id,
      actorId: createdBy ?? 'system',
      seed: seedReveal,
      commit: seedCommit
    });

    const lobby = await lobbyStore.getDetailed(lobbyRow.id);
    if (!lobby) {
      throw new Error('Failed to load lobby after creation');
    }
    const seatTxMap = await mapSeatTxs([lobby]);
    res.status(201).json({ lobby: serializeLobby(lobby, seatTxMap) });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

lobbiesRouter.get('/:id', async (req, res) => {
  try {
    const lobby = await lobbyStore.getDetailed(req.params.id);
    if (!lobby) {
      return res.status(404).json({ error: 'Lobby not found' });
    }
    const seatTxMap = await mapSeatTxs([lobby]);
    res.json({ lobby: serializeLobby(lobby, seatTxMap) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

lobbiesRouter.post('/:id/join', async (req, res) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const user = await userStore.getById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const lobbyId = req.params.id;
    const cutoffIso = new Date(Date.now() - RESERVATION_WINDOW_MS).toISOString();
    await seatStore.releaseExpired(lobbyId, cutoffIso);

    const lobby = await ensureLobbyExists(lobbyId);
    const activeRound = lobby.currentRound ?? (await roundStore.create(lobby.lobby.id, 1));

    const existingSeat = lobby.seats.find((seat) => seat.user_id === userId && seat.status !== 'free');
    if (existingSeat) {
      return res.status(400).json({ error: 'User already occupies a seat' });
    }

    const openSeat = lobby.seats.find((seat) => seat.status === 'free');
    if (!openSeat) {
      return res.status(409).json({ error: 'No free seats available' });
    }

    const reservedSeat = await seatStore.reserveSeat(openSeat.id, userId, new Date().toISOString());
    await txLogStore.insert({
      userId,
      lobbyId: lobby.lobby.id,
      seatId: reservedSeat.id,
      action: 'join',
      metadata: {
        lobbyId: lobby.lobby.id,
        lobbyCode: lobby.lobby.lobby_code,
        seatIndex: reservedSeat.seat_index,
        roundId: activeRound.id
      }
    });

    const seatTxMap = await txLogStore.latestSeatPayments([reservedSeat.id]);
    const seatPayload = serializeSeat(reservedSeat, seatTxMap);
    emitSeatUpdate({ lobbyId, seat: seatPayload });
    emitTimerTick(buildSeatTimerTickPayload(lobbyId, seatPayload));
    res.json({ seat: seatPayload, message: 'Seat reserved. Complete payment before expiration.' });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

lobbiesRouter.post('/:id/pay', async (req, res) => {
  const { seatId, txHash } = req.body as { seatId?: string; txHash?: string };
  if (!seatId || !txHash) {
    return res.status(400).json({ error: 'seatId and txHash are required' });
  }

  try {
    const lobby = await ensureLobbyExists(req.params.id);
    const seat = lobby.seats.find((candidate) => candidate.id === seatId);
    if (!seat) {
      return res.status(404).json({ error: 'Seat not found' });
    }
    if (seat.status === 'paid') {
      const seatTxMap = await txLogStore.latestSeatPayments([seat.id]);
      return res.json({ seat: serializeSeat(seat, seatTxMap), status: 'already_paid' });
    }
    if (seat.status !== 'taken' || !seat.user_id || !seat.taken_at) {
      return res.status(400).json({ error: 'Seat is not reserved' });
    }

    const reservedAt = Date.parse(seat.taken_at);
    if (Number.isNaN(reservedAt)) {
      return res.status(400).json({ error: 'Invalid reservation timestamp' });
    }
    if (Date.now() - reservedAt > PAYMENT_WINDOW_MS) {
      await seatStore.releaseSeat(seat.id, new Date().toISOString());
      return res.status(400).json({ error: 'Reservation expired' });
    }

    const paidSeat = await seatStore.markPaid(
      seat.id,
      numberParsers.toNumber(lobby.lobby.stake_amount) ?? 0,
      new Date().toISOString()
    );
    await txLogStore.insert({
      userId: paidSeat.user_id ?? undefined,
      lobbyId: lobby.lobby.id,
      seatId: paidSeat.id,
      action: 'pay',
      txHash,
      amountTon: numberParsers.toNumber(lobby.lobby.stake_amount) ?? undefined,
      metadata: {
        lobbyId: lobby.lobby.id,
        lobbyCode: lobby.lobby.lobby_code,
        seatIndex: paidSeat.seat_index,
        roundId: lobby.currentRound?.id ?? null
      }
    });

    const seatTxMap = await txLogStore.latestSeatPayments([paidSeat.id]);
    const seatPayload = serializeSeat(paidSeat, seatTxMap);
    emitSeatUpdate({ lobbyId: req.params.id, seat: seatPayload });
    emitPaymentConfirmed({ lobbyId: req.params.id, seat: seatPayload, txHash });
    emitTimerTick(buildSeatTimerTickPayload(req.params.id, seatPayload));
    res.json({ seat: seatPayload, status: 'pending_confirmation' });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

lobbiesRouter.post('/:id/finalize', async (req, res) => {
  try {
    const lobby = await ensureLobbyExists(req.params.id);
    const round = lobby.currentRound;
    if (!round) {
      return res.status(400).json({ error: 'Round not found for lobby' });
    }
    if (!round.round_hash) {
      return res.status(400).json({ error: 'Round hash is missing' });
    }

    const seedRecord = await auditLogStore.getSeedByCommit(lobby.lobby.round_seed_commit);
    if (!seedRecord?.seed) {
      return res.status(400).json({ error: 'Seed reveal not recorded' });
    }

    const recalculatedCommit = createHash('sha256').update(seedRecord.seed).digest('hex');
    if (recalculatedCommit !== lobby.lobby.round_seed_commit) {
      return res.status(400).json({ error: 'Seed does not match stored commit' });
    }

    const paidSeats = lobby.seats.filter((seat) => seat.status === 'paid' && seat.user_id);
    if (!paidSeats.length) {
      return res.status(400).json({ error: 'No paid seats to finalize' });
    }

    const digest = createHash('sha256').update(round.round_hash).update(seedRecord.seed).digest('hex');
    const winnerIndex = parseInt(digest.slice(0, 16), 16) % paidSeats.length;
    const winnerSeat = paidSeats[winnerIndex];
    if (!winnerSeat?.user_id) {
      return res.status(400).json({ error: 'Unable to determine winner seat' });
    }
    const winner = await userStore.getById(winnerSeat.user_id);
    if (!winner?.wallet) {
      return res.status(400).json({ error: 'Winner wallet not available' });
    }

    const payoutTon = (numberParsers.toNumber(lobby.lobby.stake_amount) ?? 0) * paidSeats.length;
    const finalizedAt = new Date().toISOString();

    await lobbyStore.update(lobby.lobby.id, { status: 'finalized', round_seed_reveal: seedRecord.seed });
    await roundStore.update(round.id, {
      winner_user_id: winnerSeat.user_id,
      winner_wallet: winner.wallet,
      payout_amount: payoutTon,
      finalized_at: finalizedAt
    });
    await auditLogStore.recordSeedReveal({
      lobbyId: lobby.lobby.id,
      actorId: 'system',
      seed: seedRecord.seed,
      commit: lobby.lobby.round_seed_commit
    });
    await txLogStore.insert({
      userId: winnerSeat.user_id,
      lobbyId: lobby.lobby.id,
      seatId: winnerSeat.id,
      action: 'result',
      amountTon: payoutTon,
      status: 'confirmed',
      metadata: {
        lobbyId: lobby.lobby.id,
        roundId: round.id,
        winnerSeatIndex: winnerSeat.seat_index,
        seedReveal: seedRecord.seed
      }
    });

    const tonSubmission = await sendFinalizeRound({
      lobbyId: lobby.lobby.id,
      roundId: round.id,
      winnerWallet: winner.wallet,
      payoutTon
    });

    if (tonSubmission?.txHash) {
      await roundStore.update(round.id, { tx_hash: tonSubmission.txHash });
      await txLogStore.insert({
        userId: winnerSeat.user_id,
        lobbyId: lobby.lobby.id,
        seatId: winnerSeat.id,
        action: 'payout',
        txHash: tonSubmission.txHash,
        amountTon: payoutTon,
        status: 'pending',
        metadata: { lobbyId: lobby.lobby.id, roundId: round.id }
      });
    }

    const latestRound = await roundStore.getById(round.id);
    const updatedComposite: LobbyComposite = {
      ...lobby,
      lobby: { ...lobby.lobby, status: 'finalized', round_seed_reveal: seedRecord.seed },
      currentRound: latestRound ?? lobby.currentRound
    };
    emitRoundFinalized({
      lobbyId: req.params.id,
      round: latestRound,
      tonSubmission,
      seedReveal: seedRecord.seed
    });

    const seatTxMap = await mapSeatTxs([updatedComposite]);
    res.json({
      lobby: serializeLobby(updatedComposite, seatTxMap),
      round: latestRound,
      tonSubmission,
      seedReveal: seedRecord.seed
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});
