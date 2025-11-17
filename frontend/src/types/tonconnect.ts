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
  sendTransaction?: (request: TonConnectTransactionRequest) => Promise<TonConnectTransactionResponse>;
}

export type TonConnectUIConstructor = new (options: TonConnectUIOptions) => TonConnectUIInstance;

export interface TonConnectTransactionMessage {
  address: string;
  amount: string;
  payload?: string;
  stateInit?: string;
}

export interface TonConnectTransactionRequest {
  validUntil: number;
  messages: TonConnectTransactionMessage[];
}

export type TonConnectTransactionResponse = { boc: string } | string;

declare global {
  interface Window {
    TonConnectUI?: TonConnectUIConstructor;
  }
}

export {};
