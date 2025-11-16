import { API_BASE_URL } from '../lib/constants';

export type SeatStatus = 'free' | 'taken' | 'paid';

export interface LobbySeat {
  id: string;
  seatIndex: number;
  status: SeatStatus | string;
  userId?: string;
  reservedAt?: string;
  paidAt?: string;
  expiresAt?: string;
  txHash?: string;
}

export interface LobbySummary {
  id: string;
  lobbyCode: string;
  class: string;
  stake: number;
  seatsTotal: number;
  status: string;
  roundWallet: string;
  createdAt: string;
  updatedAt: string;
  seedCommit: string;
  seedReveal?: string;
  currentRoundId?: string;
  roundHash?: string;
  paidSeats: number;
  payoutPoolTon: number;
  seats: LobbySeat[];
}

export interface RoundSummary {
  id: string;
  lobbyId: string;
  roundNumber: number;
  roundHash?: string;
  winnerUserId?: string;
  winnerWallet?: string;
  payoutAmount?: number;
  finalizedAt?: string;
  txHashes: string[];
}

export interface UserProfile {
  id: string;
  telegramId?: string;
  username?: string;
  wallet?: string;
  avatarUrl?: string;
  referralCode?: string;
  balanceTon: number;
  createdAt: string;
  updatedAt: string;
}

export interface JoinLobbyResponse {
  seat: LobbySeat;
  message?: string;
}

export interface PaySeatResponse {
  seat: LobbySeat;
  status: string;
}

export interface StakeSubmission {
  txHash: string;
  status?: string;
  simulated?: boolean;
}

export interface StakeSubmissionResponse {
  submission: StakeSubmission;
}

const normalizePath = (path: string) => (path.startsWith('/') ? path : `/${path}`);

const buildUrl = (path: string) => {
  const normalized = normalizePath(path);
  if (!API_BASE_URL) {
    return normalized;
  }
  return `${API_BASE_URL.replace(/\/$/, '')}${normalized}`;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {})
    },
    ...options
  });

  if (!response.ok) {
    const text = (await response.text())?.trim();
    const detail = text || response.statusText || 'Request failed';
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }

  return (await response.json()) as T;
}

export async function listLobbies(): Promise<LobbySummary[]> {
  const payload = await request<{ lobbies: LobbySummary[] }>('/lobbies');
  return payload.lobbies;
}

export async function fetchLobby(lobbyId: string): Promise<LobbySummary> {
  const payload = await request<{ lobby: LobbySummary }>(`/lobbies/${encodeURIComponent(lobbyId)}`);
  return payload.lobby;
}

export async function joinLobby(lobbyId: string, userId: string): Promise<JoinLobbyResponse> {
  const payload = await request<JoinLobbyResponse>(`/lobbies/${encodeURIComponent(lobbyId)}/join`, {
    method: 'POST',
    body: JSON.stringify({ userId })
  });
  return payload;
}

export async function paySeat(lobbyId: string, seatId: string, txHash: string): Promise<PaySeatResponse> {
  const payload = await request<PaySeatResponse>(`/lobbies/${encodeURIComponent(lobbyId)}/pay`, {
    method: 'POST',
    body: JSON.stringify({ seatId, txHash })
  });
  return payload;
}

export async function listRounds(): Promise<RoundSummary[]> {
  const payload = await request<{ rounds: RoundSummary[] }>('/rounds');
  return payload.rounds;
}

export async function fetchRound(roundId: string): Promise<RoundSummary> {
  const payload = await request<{ round: RoundSummary }>(`/rounds/${encodeURIComponent(roundId)}`);
  return payload.round;
}

export async function fetchUserByWallet(wallet: string): Promise<UserProfile> {
  const payload = await request<{ user: UserProfile }>(`/users/wallet/${encodeURIComponent(wallet)}`);
  return payload.user;
}

export async function sendStakeTransaction(params: {
  lobbyId: string;
  seatId: string;
  participantWallet: string;
  amountTon: number;
}): Promise<StakeSubmission> {
  const payload = await request<StakeSubmissionResponse>('/ton/pay-stake', {
    method: 'POST',
    body: JSON.stringify(params)
  });
  return payload.submission;
}
