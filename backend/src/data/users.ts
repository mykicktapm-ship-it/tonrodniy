import { User } from './types';

export const users: User[] = [
  {
    id: 'user-tony',
    username: 'tony.hash',
    wallet: 'EQDn4TonyWalletHash0001',
    avatar: 'https://tonrody.dev/static/avatars/tony.png',
    createdAt: '2024-03-01T10:00:00.000Z',
    reputation: 98
  },
  {
    id: 'user-eve',
    username: 'eve.audit',
    wallet: 'EQDv4EveWalletHash0002',
    avatar: 'https://tonrody.dev/static/avatars/eve.png',
    createdAt: '2024-03-05T12:30:00.000Z',
    reputation: 92
  },
  {
    id: 'user-ari',
    username: 'ari.laboratory',
    wallet: 'EQDq4AriWalletHash0003',
    avatar: 'https://tonrody.dev/static/avatars/ari.png',
    createdAt: '2024-03-07T09:00:00.000Z',
    reputation: 88
  }
];

export const getUserById = (id: string) => users.find((user) => user.id === id);
