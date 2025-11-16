export type LobbyClass = 'standard' | 'highroller' | 'experimental';
export type SeatStatus = 'free' | 'taken' | 'paid';
export type LobbyStatus = 'open' | 'filling' | 'locked' | 'finalized';

export interface User {
  id: string;
  username: string;
  wallet: string;
  avatar: string;
  createdAt: string;
  reputation: number;
}

export interface Seat {
  id: string;
  seatIndex: number;
  status: SeatStatus;
  userId?: string;
  txHash?: string;
  reservedAt?: string;
  expiresAt?: string;
}

export interface Lobby {
  id: string;
  class: LobbyClass;
  stake: number;
  seatsTotal: number;
  roundWallet: string;
  status: LobbyStatus;
  createdAt: string;
  seedCommit: string;
  seedRevealAt?: string;
  currentRoundId: string;
  expiresAt?: string;
  seats: Seat[];
}

export interface Round {
  id: string;
  lobbyId: string;
  roundHash: string;
  winnerUserId?: string;
  winnerWallet?: string;
  payoutAmount?: number;
  finalizedAt?: string;
  txHashes: string[];
}

export type TonWebhookEventType = 'DepositReceived' | 'WinnerSelected' | 'PayoutSent';

export interface TxLog {
  id: string;
  lobbyId: string;
  roundId?: string;
  txHash?: string;
  wallet?: string;
  amountTon?: number;
  eventType: TonWebhookEventType;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  lobbyId: string;
  userId: string;
  action: 'join' | 'pay' | 'leave' | 'result' | 'payout';
  seatIndex?: number;
  txHash?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}
