import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

export type LobbyEvent = {
  type: 'seat_update' | 'payment_confirmed' | 'round_finalized' | 'lobby_status';
  payload: Record<string, unknown>;
};

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

const channelName = (lobbyId: string) => `lobby:${lobbyId}`;

export const broadcastLobbyEvent = (lobbyId: string, event: LobbyEvent) => {
  if (!hubInstance) return;
  hubInstance.broadcast(channelName(lobbyId), event);
};
