import { useMemo } from 'react';
import { useQuery } from '../lib/queryClient';
import { fetchUserByWallet, type UserProfile } from '../services/apiClient';
import { useWalletStore } from '../stores/walletStore';

export function useConnectedUser() {
  const wallet = useWalletStore((state) => state.address);
  const normalized = useMemo(() => wallet?.trim(), [wallet]);
  return useQuery<UserProfile>({
    queryKey: ['user', 'wallet', normalized ?? ''],
    queryFn: () => {
      if (!normalized) {
        throw new Error('Wallet address is required');
      }
      return fetchUserByWallet(normalized);
    },
    enabled: Boolean(normalized)
  });
}
