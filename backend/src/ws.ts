import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

export type LobbyEvent = {
  type:
    | 'seat_update'
    | 'payment_confirmed'
    | 'round_finalized'
    | 'lobby_status'
    | 'timer_tick'
    | 'payout_sent';
  payload: unknown;
};

type SeatEventPayload = {
  lobbyId: string;
  seat: unknown;
};

export type PaymentConfirmedPayload = SeatEventPayload & { txHash?: string };
export type RoundFinalizedPayload = Record<string, unknown> & { lobbyId: string };
export type PayoutSentPayload = Record<string, unknown> & { lobbyId: string };

export interface TimerTickPayload {
  lobbyId: string;
  seatId?: string;
  seatIndex?: number;
  status?: string;
  userId?: string;
  reservedAt?: string;
  paidAt?: string;
  expiresAt?: string;
  remainingMs?: number;
  timestamp: string;
}

export interface SeatTimerSnapshot {
  id?: string;
  seatIndex?: number;
  status?: string;
  userId?: string;
  reservedAt?: string;
  paidAt?: string;
  expiresAt?: string;
}

class Hub {
  private wss: WebSocketServer;
  private channelMap = new Map<string, Set<WebSocket>>();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (socket) => this.bindSocket(socket));
  }

  private bindSocket(socket: WebSocket) {
    const channels = new Set<string>();

    socket.on('message', (data) => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.type === 'subscribe' && typeof payload.channel === 'string') {
          this.subscribe(payload.channel, socket, channels);
        } else if (payload.type === 'unsubscribe' && typeof payload.channel === 'string') {
          this.unsubscribe(payload.channel, socket, channels);
        }
      } catch (error) {
        socket.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
      }
    });

    socket.on('close', () => {
      channels.forEach((channel) => this.unsubscribe(channel, socket, channels));
    });
  }

  private subscribe(channel: string, socket: WebSocket, channelRegistry: Set<string>) {
    if (!this.channelMap.has(channel)) {
      this.channelMap.set(channel, new Set());
    }

    const sockets = this.channelMap.get(channel)!;
    sockets.add(socket);
    channelRegistry.add(channel);

    socket.send(
      JSON.stringify({ type: 'subscribed', channel, timestamp: new Date().toISOString() })
    );
  }

  private unsubscribe(channel: string, socket: WebSocket, channelRegistry: Set<string>) {
    const sockets = this.channelMap.get(channel);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) {
      this.channelMap.delete(channel);
    }
    channelRegistry.delete(channel);
  }

  broadcast(channel: string, event: LobbyEvent) {
    const sockets = this.channelMap.get(channel);
    if (!sockets) return;
    const payload = JSON.stringify(event);
    sockets.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    });
  }
}

let hubInstance: Hub | null = null;

export const initWebSocketHub = (server: Server) => {
  hubInstance = new Hub(server);
  return hubInstance;
};

export const isWebSocketHealthy = (): boolean => hubInstance !== null;

const channelName = (lobbyId: string) => `lobby:${lobbyId}`;

export const broadcastLobbyEvent = (lobbyId: string, event: LobbyEvent) => {
  if (!hubInstance) return;
  hubInstance.broadcast(channelName(lobbyId), event);
};

const dispatchSeatEvent = (eventType: LobbyEvent['type'], payload: unknown) => {
  const lobbyId = (payload as { lobbyId?: string })?.lobbyId;
  if (!lobbyId) return;
  broadcastLobbyEvent(lobbyId, { type: eventType, payload });
};

export const emitSeatUpdate = (payload: SeatEventPayload) => {
  dispatchSeatEvent('seat_update', payload);
};

export const emitPaymentConfirmed = (payload: PaymentConfirmedPayload) => {
  dispatchSeatEvent('payment_confirmed', payload);
};

export const emitRoundFinalized = (payload: RoundFinalizedPayload) => {
  dispatchSeatEvent('round_finalized', payload);
};

export const emitPayoutSent = (payload: PayoutSentPayload) => {
  dispatchSeatEvent('payout_sent', payload);
};

export const emitTimerTick = (payload: TimerTickPayload) => {
  dispatchSeatEvent('timer_tick', payload);
};

export const buildSeatTimerTickPayload = (lobbyId: string, seat: SeatTimerSnapshot): TimerTickPayload => {
  const expiresAt = seat.expiresAt;
  const expiresTs = expiresAt ? Date.parse(expiresAt) : undefined;
  const remainingMs =
    expiresTs && !Number.isNaN(expiresTs) ? Math.max(0, expiresTs - Date.now()) : undefined;

  return {
    lobbyId,
    seatId: seat.id,
    seatIndex: seat.seatIndex,
    status: seat.status,
    userId: seat.userId,
    reservedAt: seat.reservedAt,
    paidAt: seat.paidAt,
    expiresAt,
    remainingMs,
    timestamp: new Date().toISOString()
  };
};
