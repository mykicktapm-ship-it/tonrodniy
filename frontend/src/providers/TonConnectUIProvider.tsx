import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface TonConnectAccount {
  address: string;
  chain?: string;
}

interface TonConnectDevice {
  appName?: string;
  platform?: string;
}

export interface TonConnectConnectedWallet {
  account: TonConnectAccount;
  device?: TonConnectDevice;
}

interface TonConnectUIOptions {
  manifestUrl: string;
}

interface TonConnectUIInstance {
  wallet?: TonConnectConnectedWallet | null;
  connectionRestored?: Promise<boolean>;
  onStatusChange?: (callback: (wallet: TonConnectConnectedWallet | null) => void) => () => void;
  openModal?: () => Promise<void> | void;
  disconnect?: () => Promise<void> | void;
}

type TonConnectStatus = 'idle' | 'loading' | 'ready' | 'error';

interface TonConnectContextValue {
  wallet: TonConnectConnectedWallet | null;
  tonConnectUI: TonConnectUIInstance | null;
  status: TonConnectStatus;
  error?: string;
  isRestoring: boolean;
  isBusy: boolean;
  openModal: () => Promise<void>;
  disconnect: () => Promise<void>;
  retry: () => void;
}

const TonConnectContext = createContext<TonConnectContextValue | undefined>(undefined);

declare global {
  interface Window {
    TonConnectUI?: new (options: TonConnectUIOptions) => TonConnectUIInstance;
  }
}

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
  const [wallet, setWallet] = useState<TonConnectConnectedWallet | null>(null);
  const [tonConnectUI, setTonConnectUI] = useState<TonConnectUIInstance | null>(null);
  const [status, setStatus] = useState<TonConnectStatus>('idle');
  const [error, setError] = useState<string | undefined>();
  const [isRestoring, setIsRestoring] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;
    let instance: TonConnectUIInstance | null = null;

    async function initTonConnect() {
      if (typeof window === 'undefined') {
        return;
      }

      setStatus('loading');
      setError(undefined);
      setIsRestoring(true);

      try {
        await ensureTonConnectScript();
        if (!isMounted) return;

        const TonConnectCtor = window.TonConnectUI;
        if (!TonConnectCtor) {
          throw new Error('TonConnect UI is unavailable in this environment');
        }

        const absoluteManifestUrl = new URL(manifestUrl, window.location.origin).toString();
        instance = new TonConnectCtor({ manifestUrl: absoluteManifestUrl });
        setTonConnectUI(instance);
        setStatus('ready');
        setWallet(instance.wallet ?? null);

        if (instance.connectionRestored) {
          instance.connectionRestored.finally(() => {
            if (isMounted) {
              setIsRestoring(false);
            }
          });
        } else {
          setIsRestoring(false);
        }

        if (instance.onStatusChange) {
          unsubscribe = instance.onStatusChange((nextWallet) => {
            if (!isMounted) return;
            setWallet(nextWallet);
          });
        }
      } catch (err) {
        if (!isMounted) return;
        setStatus('error');
        setWallet(null);
        setTonConnectUI(null);
        setIsRestoring(false);
        setError(err instanceof Error ? err.message : 'Failed to initialize TonConnect UI');
      }
    }

    initTonConnect();

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [manifestUrl, reloadKey]);

  const retry = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const openModal = useCallback(async () => {
    if (!tonConnectUI?.openModal) {
      setError('Wallet provider is not ready yet.');
      return;
    }

    setIsBusy(true);
    setError(undefined);
    try {
      await Promise.resolve(tonConnectUI.openModal());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open wallet modal');
    } finally {
      setIsBusy(false);
    }
  }, [tonConnectUI]);

  const disconnect = useCallback(async () => {
    if (!tonConnectUI?.disconnect) {
      return;
    }

    setIsBusy(true);
    try {
      await Promise.resolve(tonConnectUI.disconnect());
      setWallet(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect wallet');
    } finally {
      setIsBusy(false);
    }
  }, [tonConnectUI]);

  const value = useMemo<TonConnectContextValue>(
    () => ({
      wallet,
      tonConnectUI,
      status,
      error,
      isRestoring,
      isBusy,
      openModal,
      disconnect,
      retry,
    }),
    [wallet, tonConnectUI, status, error, isRestoring, isBusy, openModal, disconnect, retry],
  );

  return <TonConnectContext.Provider value={value}>{children}</TonConnectContext.Provider>;
}

export function useTonConnectContext() {
  const context = useContext(TonConnectContext);
  if (!context) {
    throw new Error('useTonConnectContext must be used within TonConnectUIProvider');
  }
  return context;
}

export function useTonWallet() {
  return useTonConnectContext().wallet;
}

export function useTonConnectUI() {
  const { tonConnectUI } = useTonConnectContext();
  return [tonConnectUI, () => undefined] as const;
}
