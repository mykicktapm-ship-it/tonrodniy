import { useEffect } from 'react';
import { QueryClient, useQueryClient } from '../lib/queryClient';
import type { LobbySeat } from '../lib/api';
import { API_BASE_URL } from '../lib/constants';
import { patchLobbyMeta, syncSeatAcrossCaches } from '../lib/lobbyUtils';

const buildWsUrl = () => {
  const base = API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : null);
  if (!base) {
    return null;
  }
  const origin = API_BASE_URL && typeof window !== 'undefined' ? new URL(API_BASE_URL, window.location.origin).toString() : base;
  const url = new URL(origin);
  url.pathname = '/ws';
  url.search = '';
  url.hash = '';
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
};

const handleRoundFinalized = (client: QueryClient, payload: Record<string, unknown>) => {
  const lobbyId = payload.lobbyId as string | undefined;
  if (!lobbyId) {
    return;
  }
  const seedReveal = payload.seedReveal as string | undefined;
  patchLobbyMeta(client, lobbyId, { seedReveal, status: 'finalized' });
  if (payload.round && typeof (payload.round as { id?: string }).id === 'string') {
    const roundId = (payload.round as { id: string }).id;
    client.invalidateQueries(['round', roundId]);
  }
  client.invalidateQueries(['rounds']);
};

const toSeatPayload = (raw: any): LobbySeat | undefined => {
  if (!raw) {
    return undefined;
  }
  if (raw.seat) {
    return raw.seat as LobbySeat;
  }
  if (!raw.seatId) {
    return undefined;
  }
  return {
    id: raw.seatId,
    seatIndex: raw.seatIndex ?? 0,
    status: raw.status ?? 'taken',
    userId: raw.userId,
    reservedAt: raw.reservedAt,
    paidAt: raw.paidAt,
    expiresAt: raw.expiresAt
  };
};

export function useLobbyChannel(lobbyId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!lobbyId) {
      return;
    }
    const wsUrl = buildWsUrl();
    if (!wsUrl) {
      return;
    }
    const channel = `lobby:${lobbyId}`;
    const socket = new WebSocket(wsUrl);
    let closed = false;

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'subscribe', channel }));
    });

    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string; payload?: Record<string, unknown> };
        if (!payload?.type || !payload.payload) {
          return;
        }
        if ((payload.payload.lobbyId as string | undefined) !== lobbyId) {
          return;
        }
        switch (payload.type) {
          case 'seat_update':
          case 'payment_confirmed': {
            const seat = toSeatPayload(payload.payload);
            if (seat) {
              syncSeatAcrossCaches(queryClient, lobbyId, seat);
            }
            break;
          }
          case 'timer_tick': {
            const seat = toSeatPayload(payload.payload);
            if (seat) {
              syncSeatAcrossCaches(queryClient, lobbyId, seat);
            }
            break;
          }
          case 'round_finalized':
            handleRoundFinalized(queryClient, payload.payload);
            break;
          default:
            break;
        }
      } catch (error) {
        console.warn('[useLobbyChannel] Failed to parse WS event', error);
      }
    });

    return () => {
      if (!closed) {
        try {
          socket.send(JSON.stringify({ type: 'unsubscribe', channel }));
        } catch (error) {
          console.warn('[useLobbyChannel] Failed to send unsubscribe', error);
        }
      }
      socket.close();
      closed = true;
    };
  }, [lobbyId, queryClient]);
}
