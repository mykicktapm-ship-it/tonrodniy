import { randomUUID } from 'crypto';
import { appendActivity, getActivityForUser } from './activity';
import { lobbies, getLobbyById } from './lobbies';
import { rounds, getRoundById } from './rounds';
import { getUserById, users } from './users';
import { ActivityLog, Lobby, Seat } from './types';

export const listLobbies = () =>
  lobbies.map((lobby) => ({
    ...lobby,
    paidSeats: lobby.seats.filter((seat) => seat.status === 'paid').length
  }));

export const findLobby = (id: string) => getLobbyById(id);

export const listUsers = () => users;

export const findUser = (id: string) => getUserById(id);

export const listRounds = () => rounds;

export const findRound = (id: string) => getRoundById(id);

const getSeatById = (lobby: Lobby, seatId: string) => lobby.seats.find((seat) => seat.id === seatId);

export const joinLobby = (lobbyId: string, userId: string) => {
  const lobby = getLobbyById(lobbyId);
  if (!lobby) {
    throw new Error('Lobby not found');
  }

  const seat = lobby.seats.find((candidate) => candidate.status === 'free');
  if (!seat) {
    throw new Error('No free seats available');
  }

  seat.status = 'taken';
  seat.userId = userId;
  seat.reservedAt = new Date().toISOString();
  seat.expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();

  const log: ActivityLog = {
    id: randomUUID(),
    lobbyId,
    userId,
    action: 'join',
    seatIndex: seat.seatIndex,
    createdAt: new Date().toISOString()
  };
  appendActivity(log);

  lobby.status = lobby.seats.every((candidate) => candidate.status !== 'free') ? 'filling' : lobby.status;

  return seat;
};

export const payForSeat = (lobbyId: string, seatId: string, txHash: string) => {
  const lobby = getLobbyById(lobbyId);
  if (!lobby) {
    throw new Error('Lobby not found');
  }

  const seat = getSeatById(lobby, seatId);
  if (!seat || !seat.userId) {
    throw new Error('Seat not reserved');
  }

  seat.status = 'paid';
  seat.txHash = txHash;

  const log: ActivityLog = {
    id: randomUUID(),
    lobbyId,
    userId: seat.userId,
    action: 'pay',
    seatIndex: seat.seatIndex,
    txHash,
    createdAt: new Date().toISOString()
  };
  appendActivity(log);

  return seat;
};

export const finalizeRound = (lobbyId: string) => {
  const lobby = getLobbyById(lobbyId);
  if (!lobby) {
    throw new Error('Lobby not found');
  }

  const round = getRoundById(lobby.currentRoundId);
  if (!round) {
    throw new Error('Round not found');
  }

  lobby.status = 'finalized';
  round.finalizedAt = new Date().toISOString();

  if (!round.winnerUserId) {
    const paidSeats = lobby.seats.filter((seat) => seat.status === 'paid' && seat.userId);
    const winnerSeat = paidSeats[0];
    if (winnerSeat?.userId) {
      round.winnerUserId = winnerSeat.userId;
      round.winnerWallet = getUserById(winnerSeat.userId)?.wallet;
      round.payoutAmount = paidSeats.length * lobby.stake;
    }
  }

  const log: ActivityLog = {
    id: randomUUID(),
    lobbyId,
    userId: round.winnerUserId ?? 'system',
    action: 'result',
    createdAt: new Date().toISOString(),
    metadata: {
      roundId: round.id,
      roundHash: round.roundHash,
      payout: round.payoutAmount
    }
  };
  appendActivity(log);

  return round;
};

export const getUserActivity = (userId: string) => getActivityForUser(userId);
