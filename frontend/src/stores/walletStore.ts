import { create } from 'zustand';
import type { TonConnectConnectedWallet, TonConnectUIInstance } from '../types/tonconnect';

export type WalletStatus = 'disconnected' | 'connecting' | 'connected';

interface WalletStoreState {
  address: string | null;
  status: WalletStatus;
  wallet: TonConnectConnectedWallet | null;
  controller: TonConnectUIInstance | null;
  setController: (controller: TonConnectUIInstance | null) => void;
  setWallet: (wallet: TonConnectConnectedWallet | null) => void;
  setAddress: (address: string | null) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export const useWalletStore = create<WalletStoreState>((set, get) => ({
  address: null,
  status: 'disconnected',
  wallet: null,
  controller: null,
  setController: (controller) => set({ controller }),
  setWallet: (wallet) =>
    set(() => {
      const address = wallet?.account.address ?? null;
      return {
        wallet,
        address,
        status: address ? 'connected' : 'disconnected',
      };
    }),
  setAddress: (address) =>
    set(() => ({
      address,
      status: address ? 'connected' : 'disconnected',
    })),
  connect: async () => {
    const controller = get().controller;
    if (!controller?.openModal || typeof window === 'undefined') {
      return;
    }

    set({ status: 'connecting' });
    try {
      await Promise.resolve(controller.openModal());
    } catch (error) {
      console.error('Failed to connect wallet', error);
    } finally {
      const { address } = get();
      if (!address) {
        set({ status: 'disconnected' });
      }
    }
  },
  disconnect: async () => {
    const controller = get().controller;
    if (!controller?.disconnect || typeof window === 'undefined') {
      set({ wallet: null, address: null, status: 'disconnected' });
      return;
    }

    try {
      await Promise.resolve(controller.disconnect());
    } catch (error) {
      console.error('Failed to disconnect wallet', error);
    } finally {
      set({ wallet: null, address: null, status: 'disconnected' });
    }
  },
}));
