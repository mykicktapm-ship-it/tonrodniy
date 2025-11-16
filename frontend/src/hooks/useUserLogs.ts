import { useQuery } from '../lib/queryClient';
import { fetchUserLogs, type UserLogEntry } from '../lib/api';

export function useUserLogs(userId?: string) {
  return useQuery<UserLogEntry[]>({
    queryKey: ['user', userId ?? '', 'logs'],
    queryFn: () => {
      if (!userId) {
        throw new Error('User id is required');
      }
      return fetchUserLogs(userId);
    },
    enabled: Boolean(userId),
    staleTime: 15_000
  });
}
