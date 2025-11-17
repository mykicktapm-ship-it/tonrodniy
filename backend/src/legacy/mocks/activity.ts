import { ActivityLog } from './types';

export const activityLogs: ActivityLog[] = [
  {
    id: 'log-1',
    lobbyId: 'lobby-alpha',
    userId: 'user-tony',
    action: 'join',
    seatIndex: 0,
    createdAt: '2024-03-08T10:05:00.000Z'
  },
  {
    id: 'log-2',
    lobbyId: 'lobby-alpha',
    userId: 'user-tony',
    action: 'pay',
    seatIndex: 0,
    txHash: '0xhash-alpha-0',
    createdAt: '2024-03-08T10:07:00.000Z'
  },
  {
    id: 'log-3',
    lobbyId: 'lobby-alpha',
    userId: 'user-eve',
    action: 'join',
    seatIndex: 1,
    createdAt: '2024-03-08T10:06:00.000Z'
  },
  {
    id: 'log-4',
    lobbyId: 'lobby-alpha',
    userId: 'user-eve',
    action: 'pay',
    seatIndex: 1,
    txHash: '0xhash-alpha-1',
    createdAt: '2024-03-08T10:08:00.000Z'
  },
  {
    id: 'log-5',
    lobbyId: 'lobby-alpha',
    userId: 'user-tony',
    action: 'result',
    seatIndex: 0,
    createdAt: '2024-03-08T11:30:00.000Z',
    metadata: { winner: true }
  }
];

export const getActivityForUser = (userId: string) =>
  activityLogs.filter((log) => log.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export const appendActivity = (entry: ActivityLog) => {
  activityLogs.push(entry);
  return entry;
};
