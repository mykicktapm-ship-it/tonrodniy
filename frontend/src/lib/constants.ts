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

