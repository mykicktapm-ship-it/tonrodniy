const normalizeUrl = (url?: string) => (url ? url.replace(/\/$/, '') : undefined);

export const API_BASE_URL = normalizeUrl(import.meta.env.VITE_API_BASE_URL) ?? '';

export const TON_CONTRACT_ADDRESS =
  import.meta.env.VITE_TON_CONTRACT_ADDRESS ?? 'UQMockRoundWalletUntilF5';

export const APP_TABS = [
  { path: '/', label: 'Home' },
  { path: '/laboratory', label: 'Laboratory' },
  { path: '/earn', label: 'Earn' },
  { path: '/profile', label: 'Profile' },
] as const;

export const MOCK_PLAYERS = [
  { tonWallet: 'UQCT...mock1', status: 'ready' },
  { tonWallet: 'UQCG...mock2', status: 'pending' },
  { tonWallet: 'UQAA...mock3', status: 'won' },
];

export const MOCK_ROUNDS = [
  {
    id: 'round-142',
    lobby: 'Prime Pulse',
    seatCount: 4,
    stake: 12,
    state: 'collecting',
    fairHash: '0x2ab4...1f',
  },
  {
    id: 'round-143',
    lobby: 'Laboratory QA',
    seatCount: 6,
    stake: 3,
    state: 'revealed',
    fairHash: '0xb0ff...42',
  },
];

export const MOCK_ACTIVITY = [
  { id: 1, action: 'Joined LAB-21', ts: '2 min ago' },
  { id: 2, action: 'Stake confirmed', ts: '10 min ago' },
  { id: 3, action: 'Round won', ts: 'Yesterday' },
];
