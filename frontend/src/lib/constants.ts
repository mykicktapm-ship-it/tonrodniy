const normalizeUrl = (url?: string) => (url ? url.replace(/\/$/, '') : undefined);

export const API_BASE_URL = normalizeUrl(import.meta.env.VITE_API_BASE_URL) ?? '';
export const WS_BASE_URL = normalizeUrl(import.meta.env.VITE_WS_URL) ?? '';

export const TON_CONTRACT_ADDRESS =
  import.meta.env.VITE_TON_CONTRACT_ADDRESS ?? 'UQMockRoundWalletUntilF5';

export const TONCONNECT_MANIFEST_URL =
  import.meta.env.VITE_TONCONNECT_MANIFEST_URL ?? '/tonconnect-manifest.json';

export const TELEGRAM_BOT_NAME = import.meta.env.VITE_TG_BOT_NAME ?? '';
export const TELEGRAM_APP_TITLE = import.meta.env.VITE_TG_APP_TITLE ?? 'TONRODY';
export const APP_SALT = import.meta.env.VITE_APP_SALT ?? '';

export const APP_TABS = [
  { path: '/', label: 'Home' },
  { path: '/laboratory', label: 'Laboratory' },
  { path: '/earn', label: 'Earn' },
  { path: '/profile', label: 'Profile' },
] as const;

