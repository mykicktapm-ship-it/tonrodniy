import { API_BASE_URL } from './constants';

export interface OnchainRoundState {
  lobbyId: string;
  roundHash: string;
  winnerIndex: number;
  poolAmount: number;
}

const mockRoundState = (lobbyId: string): OnchainRoundState => {
  const seed = lobbyId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const winnerIndex = seed % 6;
  const poolAmount = Number((12 + (seed % 5) * 0.5).toFixed(2));
  const hex = seed.toString(16).padStart(8, '0');

  return {
    lobbyId,
    roundHash: `0x${hex}${hex}${hex.slice(0, 4)}`.slice(0, 66),
    winnerIndex,
    poolAmount,
  };
};

export async function fetchOnchainRoundState(lobbyId: string): Promise<OnchainRoundState> {
  const mock = mockRoundState(lobbyId);
  // TODO(F5): remove mock fallback once /ton/round-state is fully wired to live chain data.
  if (!API_BASE_URL) {
    return mock;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/ton/round-state/${encodeURIComponent(lobbyId)}`);
    if (!response.ok) {
      throw new Error(`round-state request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as Partial<OnchainRoundState>;
    return {
      lobbyId,
      roundHash: typeof payload.roundHash === 'string' ? payload.roundHash : mock.roundHash,
      winnerIndex:
        typeof payload.winnerIndex === 'number' ? payload.winnerIndex : mock.winnerIndex,
      poolAmount: typeof payload.poolAmount === 'number' ? payload.poolAmount : mock.poolAmount,
    };
  } catch (error) {
    console.warn('[api] Failed to fetch round-state, returning mock telemetry', error);
    return mock;
  }
}
