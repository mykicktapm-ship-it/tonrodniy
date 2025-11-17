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

export type SeatStatus = 'free' | 'taken' | 'pending_payment' | 'paid' | 'failed';

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
  contractVersion?: string;
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
  verification?: {
    status: string;
    reason?: string;
    amountTon?: number;
    sender?: string;
  };
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
  isOnchain: boolean;
  isFallback: boolean;
  fallbackReason?: string;
}

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
  txHash: string,
  userId: string
): Promise<PaySeatResponse> {
  return request<PaySeatResponse>(`/lobbies/${encodeURIComponent(lobbyId)}/pay`, {
    method: 'POST',
    body: JSON.stringify({ seatId, txHash, userId })
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

export async function fetchOnchainRoundState(lobbyId: string): Promise<OnchainRoundState> {
  try {
    const payload = await request<{ lobbyState?: Partial<OnchainRoundState>; isOnchain?: boolean; isFallback?: boolean; error?: string }>(
      `/ton/round-state/${encodeURIComponent(lobbyId)}`
    );
    if (payload.lobbyState && payload.isOnchain) {
      return {
        lobbyId: payload.lobbyState.lobbyId ?? lobbyId,
        roundId: payload.lobbyState.roundId ?? `round-${lobbyId}`,
        onChainBalanceTon: payload.lobbyState.onChainBalanceTon ?? 0,
        lockedStakeTon: payload.lobbyState.lockedStakeTon ?? 0,
        lastRoundHash: payload.lobbyState.lastRoundHash ?? '',
        seatsPaid: payload.lobbyState.seatsPaid ?? 0,
        seatsTotal: payload.lobbyState.seatsTotal ?? 0,
        lastEventType: payload.lobbyState.lastEventType,
        updatedAt: payload.lobbyState.updatedAt ?? new Date().toISOString(),
        isOnchain: true,
        isFallback: false
      };
    }
    return {
      lobbyId,
      roundId: `round-${lobbyId}`,
      onChainBalanceTon: 0,
      lockedStakeTon: 0,
      lastRoundHash: '',
      seatsPaid: 0,
      seatsTotal: 0,
      lastEventType: undefined,
      updatedAt: new Date().toISOString(),
      isOnchain: false,
      isFallback: true,
      fallbackReason: payload.error ?? 'TON telemetry unavailable'
    };
  } catch (error) {
    return {
      lobbyId,
      roundId: `round-${lobbyId}`,
      onChainBalanceTon: 0,
      lockedStakeTon: 0,
      lastRoundHash: '',
      seatsPaid: 0,
      seatsTotal: 0,
      lastEventType: undefined,
      updatedAt: new Date().toISOString(),
      isOnchain: false,
      isFallback: true,
      fallbackReason: error instanceof Error ? error.message : 'TON telemetry unavailable'
    };
  }
}
