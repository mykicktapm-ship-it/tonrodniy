export interface TonConnectAccount {
  address: string;
  chain?: string;
}

export interface TonConnectDevice {
  appName?: string;
  platform?: string;
}

export interface TonConnectConnectedWallet {
  account: TonConnectAccount;
  device?: TonConnectDevice;
}

export interface TonConnectUIOptions {
  manifestUrl: string;
}

export interface TonConnectUIInstance {
  wallet?: TonConnectConnectedWallet | null;
  connectionRestored?: Promise<boolean>;
  onStatusChange?: (callback: (wallet: TonConnectConnectedWallet | null) => void) => () => void;
  openModal?: () => Promise<void> | void;
  disconnect?: () => Promise<void> | void;
}

export type TonConnectUIConstructor = new (options: TonConnectUIOptions) => TonConnectUIInstance;

declare global {
  interface Window {
    TonConnectUI?: TonConnectUIConstructor;
  }
}

export {};
