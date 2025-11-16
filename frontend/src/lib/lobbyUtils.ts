import type { LobbySeat, LobbySummary } from '../services/apiClient';
import type { QueryClient } from './queryClient';

export const applySeatUpdate = (lobby: LobbySummary, nextSeat: LobbySeat): LobbySummary => {
  const seats = lobby.seats.map((seat) => (seat.id === nextSeat.id ? { ...seat, ...nextSeat } : seat));
  const paidSeats = seats.filter((seat) => seat.status === 'paid').length;
  return {
    ...lobby,
    seats,
    paidSeats,
    payoutPoolTon: paidSeats * lobby.stake
  };
};

export const syncSeatAcrossCaches = (client: QueryClient, lobbyId: string, seat: LobbySeat) => {
  client.setQueryData<LobbySummary>(['lobby', lobbyId], (prev) => (prev ? applySeatUpdate(prev, seat) : prev));
  client.setQueryData<LobbySummary[]>(['lobbies'], (prev) =>
    prev ? prev.map((lobby) => (lobby.id === lobbyId ? applySeatUpdate(lobby, seat) : lobby)) : prev
  );
};

export const patchLobbyMeta = (client: QueryClient, lobbyId: string, patch: Partial<LobbySummary>) => {
  client.setQueryData<LobbySummary>(['lobby', lobbyId], (prev) => (prev ? { ...prev, ...patch } : prev));
  client.setQueryData<LobbySummary[]>(['lobbies'], (prev) =>
    prev ? prev.map((lobby) => (lobby.id === lobbyId ? { ...lobby, ...patch } : lobby)) : prev
  );
};
