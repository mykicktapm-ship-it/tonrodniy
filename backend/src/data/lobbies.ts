import { Lobby, Seat } from './types';
import { users } from './users';

const now = new Date('2024-03-08T12:00:00.000Z');

const buildSeat = (seatIndex: number, userId?: string, status: Seat['status'] = 'free', txHash?: string): Seat => {
  const base: Seat = {
    id: `seat-${seatIndex}-${userId ?? 'open'}`,
    seatIndex,
    status
  };

  if (userId) {
    base.userId = userId;
    base.reservedAt = new Date(now.getTime() - seatIndex * 2 * 60 * 1000).toISOString();
    base.expiresAt = new Date(now.getTime() + (10 - seatIndex) * 60 * 1000).toISOString();
  }

  if (txHash) {
    base.txHash = txHash;
  }

  return base;
};

export const lobbies: Lobby[] = [
  {
    id: 'lobby-alpha',
    class: 'standard',
    stake: 1,
    seatsTotal: 4,
    roundWallet: 'EQBAlphaRoundWallet00001',
    status: 'filling',
    createdAt: '2024-03-08T10:00:00.000Z',
    seedCommit: '0xseedcommit-alpha',
    currentRoundId: 'round-alpha',
    seats: [
      buildSeat(0, users[0].id, 'paid', '0xhash-alpha-0'),
      buildSeat(1, users[1].id, 'paid', '0xhash-alpha-1'),
      buildSeat(2, users[2].id, 'taken'),
      buildSeat(3)
    ]
  },
  {
    id: 'lobby-beta',
    class: 'highroller',
    stake: 5,
    seatsTotal: 3,
    roundWallet: 'EQBBetaRoundWallet00002',
    status: 'open',
    createdAt: '2024-03-07T16:30:00.000Z',
    seedCommit: '0xseedcommit-beta',
    currentRoundId: 'round-beta',
    seats: [buildSeat(0), buildSeat(1), buildSeat(2)]
  }
];

export const getLobbyById = (lobbyId: string) => lobbies.find((lobby) => lobby.id === lobbyId);
