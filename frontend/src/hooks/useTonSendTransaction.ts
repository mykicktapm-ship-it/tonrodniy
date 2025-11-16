import { useTonConnectUI, useTonWallet, SendTransactionRequest } from '@tonconnect/ui-react';
import { useCallback, useMemo, useState } from 'react';
import { describeTonConnectError, textToBase64, tonToNano } from '../lib/ton';

export type TonSendStatus = 'idle' | 'pending' | 'success' | 'error';

export interface TonSendArgs {
  destination: string;
  amountTon: number;
  comment?: string;
}

export function useTonSendTransaction(defaultArgs: TonSendArgs) {
  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();
  const [status, setStatus] = useState<TonSendStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const canSend = useMemo(() => Boolean(wallet?.account.address), [wallet]);

  const sendTransaction = useCallback(
    async (overrideArgs?: Partial<TonSendArgs>) => {
      if (!wallet) {
        const message = 'Connect a TON wallet to continue.';
        setError(message);
        setStatus('error');
        throw new Error(message);
      }

      setStatus('pending');
      setError(null);

      const args = { ...defaultArgs, ...overrideArgs } as TonSendArgs;
      if (!args.destination) {
        const message = 'Missing round wallet destination.';
        setError(message);
        setStatus('error');
        throw new Error(message);
      }

      const request: SendTransactionRequest = {
        validUntil: Math.floor(Date.now() / 1000) + 60 * 5,
        messages: [
          {
            address: args.destination,
            amount: tonToNano(args.amountTon),
            payload: args.comment ? textToBase64(args.comment) : undefined,
          },
        ],
      };

      try {
        await tonConnectUI.sendTransaction(request);
        setStatus('success');
      } catch (err) {
        const message = describeTonConnectError(err);
        setError(message);
        setStatus('error');
        throw err;
      }
    },
    [defaultArgs, tonConnectUI, wallet],
  );

  const resetStatus = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return {
    canSend,
    sendTransaction,
    status,
    error,
    resetStatus,
  };
}
