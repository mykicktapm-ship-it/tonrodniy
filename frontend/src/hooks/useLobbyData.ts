import { useQuery } from '../lib/queryClient';
import { fetchLobby, fetchRound, listLobbies, listRounds, type LobbySummary, type RoundSummary } from '../services/apiClient';

export function useLobbiesQuery(enabled = true) {
  return useQuery<LobbySummary[]>({
    queryKey: ['lobbies'],
    queryFn: listLobbies,
    enabled,
    staleTime: 10_000
  });
}

export function useLobbyQuery(lobbyId?: string) {
  return useQuery<LobbySummary>({
    queryKey: ['lobby', lobbyId ?? ''],
    queryFn: () => {
      if (!lobbyId) {
        throw new Error('Lobby id is required');
      }
      return fetchLobby(lobbyId);
    },
    enabled: Boolean(lobbyId)
  });
}

export function useRoundsQuery(enabled = true) {
  return useQuery<RoundSummary[]>({
    queryKey: ['rounds'],
    queryFn: listRounds,
    enabled,
    staleTime: 15_000
  });
}

export function useRoundQuery(roundId?: string) {
  return useQuery<RoundSummary>({
    queryKey: ['round', roundId ?? ''],
    queryFn: () => {
      if (!roundId) {
        throw new Error('Round id is required');
      }
      return fetchRound(roundId);
    },
    enabled: Boolean(roundId)
  });
}
