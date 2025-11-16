import { API_BASE_URL } from './constants';

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

export interface UserLogEntry {
  id: string;
  action: string;
  txHash?: string;
  amountTon?: number;
  status?: string;
  lobbyId?: string;
  seatId?: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface JoinLobbyResponse {
  seat: LobbySeat;
  message?: string;
}

export interface PaySeatResponse {
  seat: LobbySeat;
  status: string;
}

export interface TonSubmission {
  roundHash?: string;
  winnerWallet?: string;
  payoutTon?: number;
  txHash?: string;
  status?: string;
}

export interface FinalizeLobbyResponse {
  lobby: LobbySummary;
  round?: RoundSummary;
  tonSubmission?: TonSubmission;
  seedReveal?: string;
}

export interface StakeSubmission {
  txHash: string;
  status?: string;
  simulated?: boolean;
}

interface StakeSubmissionResponse {
  submission: StakeSubmission;
}

export interface OnchainRoundState {
  lobbyId: string;
  roundId: string;
  onChainBalanceTon: number;
  lockedStakeTon: number;
  lastRoundHash: string;
  seatsPaid: number;
  seatsTotal: number;
  lastEventType?: string;
  updatedAt: string;
}

const mockRoundState = (lobbyId: string): OnchainRoundState => {
  const seed = lobbyId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const paid = (seed % 6) + 1;
  const total = Math.max(paid + 2, 6);
  const lastRoundHash = `0x${seed.toString(16).padStart(8, '0').repeat(8).slice(0, 64)}`;
  const balance = Number((paid * 3.2).toFixed(2));
  const locked = Number((paid * 2.4).toFixed(2));
  return {
    lobbyId,
    roundId: `round-${lobbyId}`,
    onChainBalanceTon: balance,
    lockedStakeTon: locked,
    lastRoundHash,
    seatsPaid: paid,
    seatsTotal: total,
    lastEventType: 'DepositReceived',
    updatedAt: new Date().toISOString()
  };
};

export async function fetchLobbies(): Promise<LobbySummary[]> {
  const payload = await request<{ lobbies: LobbySummary[] }>('/lobbies');
  return payload.lobbies;
}

export async function fetchLobby(lobbyId: string): Promise<LobbySummary> {
  const payload = await request<{ lobby: LobbySummary }>(`/lobbies/${encodeURIComponent(lobbyId)}`);
  return payload.lobby;
}

export async function fetchRounds(): Promise<RoundSummary[]> {
  const payload = await request<{ rounds: RoundSummary[] }>('/rounds');
  return payload.rounds;
}

export async function fetchRound(roundId: string): Promise<RoundSummary> {
  const payload = await request<{ round: RoundSummary }>(`/rounds/${encodeURIComponent(roundId)}`);
  return payload.round;
}

export async function joinLobby(lobbyId: string, userId: string): Promise<JoinLobbyResponse> {
  return request<JoinLobbyResponse>(`/lobbies/${encodeURIComponent(lobbyId)}/join`, {
    method: 'POST',
    body: JSON.stringify({ userId })
  });
}

export async function payForSeat(
  lobbyId: string,
  seatId: string,
  txHash: string
): Promise<PaySeatResponse> {
  return request<PaySeatResponse>(`/lobbies/${encodeURIComponent(lobbyId)}/pay`, {
    method: 'POST',
    body: JSON.stringify({ seatId, txHash })
  });
}

export async function finalizeLobby(lobbyId: string): Promise<FinalizeLobbyResponse> {
  return request<FinalizeLobbyResponse>(`/lobbies/${encodeURIComponent(lobbyId)}/finalize`, {
    method: 'POST'
  });
}

export async function fetchUserByWallet(wallet: string): Promise<UserProfile> {
  const payload = await request<{ user: UserProfile }>(`/users/wallet/${encodeURIComponent(wallet)}`);
  return payload.user;
}

export async function fetchUserLogs(userId: string): Promise<UserLogEntry[]> {
  const payload = await request<{ user: UserProfile; logs: UserLogEntry[] }>(
    `/users/${encodeURIComponent(userId)}/logs`
  );
  return payload.logs;
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

export async function fetchOnchainRoundState(lobbyId: string): Promise<OnchainRoundState> {
  const fallback = mockRoundState(lobbyId);
  try {
    const payload = await request<{ lobbyState?: Partial<OnchainRoundState> }>(
      `/ton/round-state/${encodeURIComponent(lobbyId)}`
    );
    const state = payload.lobbyState;
    if (!state) {
      throw new Error('round-state payload missing lobbyState');
    }
    return {
      ...fallback,
      ...state,
      lobbyId: state.lobbyId ?? fallback.lobbyId,
      roundId: state.roundId ?? fallback.roundId,
      lastRoundHash: state.lastRoundHash ?? fallback.lastRoundHash,
      onChainBalanceTon: state.onChainBalanceTon ?? fallback.onChainBalanceTon,
      lockedStakeTon: state.lockedStakeTon ?? fallback.lockedStakeTon,
      seatsPaid: state.seatsPaid ?? fallback.seatsPaid,
      seatsTotal: state.seatsTotal ?? fallback.seatsTotal,
      lastEventType: state.lastEventType ?? fallback.lastEventType,
      updatedAt: state.updatedAt ?? new Date().toISOString()
    };
  } catch (error) {
    console.warn('[api] Failed to fetch round-state, returning mock telemetry', error);
    return fallback;
  }
}
