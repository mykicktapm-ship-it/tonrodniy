import { useEffect, type ReactNode } from 'react';
import { useWalletStore } from '../stores/walletStore';
import type { TonConnectUIInstance } from '../types/tonconnect';

const TON_CONNECT_SCRIPT_URL = 'https://unpkg.com/@tonconnect/ui@latest/dist/tonconnect-ui.min.js';
let loaderPromise: Promise<void> | null = null;

async function ensureTonConnectScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('TonConnect UI is only available in the browser'));
  }

  if (window.TonConnectUI) {
    return Promise.resolve();
  }

  if (loaderPromise) {
    return loaderPromise;
  }

  loaderPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TON_CONNECT_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loaderPromise = null;
      reject(new Error('Failed to load TonConnect UI script'));
    };
    document.head.appendChild(script);
  });

  return loaderPromise;
}

interface TonConnectProviderProps {
  manifestUrl: string;
  children: ReactNode;
}

export function TonConnectUIProvider({ manifestUrl, children }: TonConnectProviderProps) {
  const setController = useWalletStore((state) => state.setController);
  const setWallet = useWalletStore((state) => state.setWallet);
  const setAddress = useWalletStore((state) => state.setAddress);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let isMounted = true;
    let unsubscribe: (() => void) | undefined;
    let instance: TonConnectUIInstance | null = null;

    async function initTonConnect() {
      try {
        await ensureTonConnectScript();
        if (!isMounted) return;

        const TonConnectCtor = window.TonConnectUI;
        if (!TonConnectCtor) {
          console.warn('TonConnect UI is unavailable in this environment');
          return;
        }

        const absoluteManifestUrl = new URL(manifestUrl, window.location.origin).toString();
        instance = new TonConnectCtor({ manifestUrl: absoluteManifestUrl });
        setController(instance);
        setWallet(instance.wallet ?? null);

        if (instance.onStatusChange) {
          unsubscribe = instance.onStatusChange((nextWallet) => {
            if (!isMounted) return;
            setWallet(nextWallet);
          });
        }
      } catch (error) {
        console.error('Failed to initialize TonConnect UI', error);
        setController(null);
        setWallet(null);
        setAddress(null);
      }
    }

    initTonConnect();

    return () => {
      isMounted = false;
      unsubscribe?.();
      setController(null);
    };
  }, [manifestUrl, setController, setWallet, setAddress]);

  return <>{children}</>;
}
