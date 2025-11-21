import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type QueryKey = ReadonlyArray<unknown>;

type QueryStatus = 'idle' | 'loading' | 'success' | 'error';

type QueryCacheEntry<TData> = {
  data?: TData;
  error?: unknown;
  status: QueryStatus;
  updatedAt: number;
};

const idleEntry: QueryCacheEntry<unknown> = { status: 'idle', updatedAt: 0 };

const cloneEntry = <TData,>(entry?: QueryCacheEntry<TData>): QueryCacheEntry<TData> =>
  entry ? { ...entry } : ({ ...idleEntry } as QueryCacheEntry<TData>);

export class QueryClient {
  private cache = new Map<string, QueryCacheEntry<unknown>>();
  private listeners = new Map<string, Set<() => void>>();

  hashKey(queryKey: QueryKey): string {
    return JSON.stringify(queryKey);
  }

  getEntry<TData>(key: string): QueryCacheEntry<TData> | undefined {
    return this.cache.get(key) as QueryCacheEntry<TData> | undefined;
  }

  private setEntry<TData>(key: string, entry: QueryCacheEntry<TData>) {
    this.cache.set(key, entry);
    this.notify(key);
  }

  subscribe(key: string, listener: () => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    const bucket = this.listeners.get(key)!;
    bucket.add(listener);
    return () => {
      bucket.delete(listener);
      if (!bucket.size) {
        this.listeners.delete(key);
      }
    };
  }

  private notify(key: string) {
    const bucket = this.listeners.get(key);
    if (!bucket) {
      return;
    }
    bucket.forEach((listener) => listener());
  }

  setQueryData<TData>(queryKey: QueryKey, updater: TData | undefined | ((prev?: TData) => TData | undefined)) {
    const key = this.hashKey(queryKey);
    const prev = this.getEntry<TData>(key);
    const nextData =
      typeof updater === 'function' ? (updater as (prev?: TData) => TData | undefined)(prev?.data) : updater;
    if (typeof nextData === 'undefined') {
      return prev?.data;
    }
    this.setEntry<TData>(key, {
      data: nextData,
      error: undefined,
      status: 'success',
      updatedAt: Date.now()
    });
    return nextData;
  }

  invalidateQueries(queryKey: QueryKey) {
    const key = this.hashKey(queryKey);
    this.cache.delete(key);
    this.notify(key);
  }

  updateEntry<TData>(queryKey: QueryKey, updater: (entry: QueryCacheEntry<TData>) => QueryCacheEntry<TData>) {
    const key = this.hashKey(queryKey);
    const current = cloneEntry(this.getEntry<TData>(key));
    const next = updater(current);
    this.setEntry<TData>(key, next);
  }
}

const QueryClientContext = createContext<QueryClient | null>(null);

export const QueryClientProvider = ({ client, children }: { client: QueryClient; children: ReactNode }) => (
  <QueryClientContext.Provider value={client}>{children}</QueryClientContext.Provider>
);

export const useQueryClient = () => {
  const client = useContext(QueryClientContext);
  if (!client) {
    throw new Error('QueryClientProvider is missing in the component tree');
  }
  return client;
};

export interface UseQueryOptions<TData> {
  queryKey: QueryKey;
  queryFn: () => Promise<TData>;
  enabled?: boolean;
  staleTime?: number;
}

export interface UseQueryResult<TData> {
  data?: TData;
  error?: unknown;
  status: QueryStatus;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<TData>;
}

export function useQuery<TData>({ queryKey, queryFn, enabled = true, staleTime = 0 }: UseQueryOptions<TData>): UseQueryResult<TData> {
  const client = useQueryClient();
  const key = useMemo(() => client.hashKey(queryKey), [client, queryKey]);
  const [entry, setEntry] = useState<QueryCacheEntry<TData>>(() => cloneEntry(client.getEntry<TData>(key)));
  const fetchRef = useRef(queryFn);
  fetchRef.current = queryFn;

  useEffect(() => {
    return client.subscribe(key, () => {
      setEntry(cloneEntry(client.getEntry<TData>(key)));
    });
  }, [client, key]);

  const runFetch = useCallback(async () => {
    client.updateEntry<TData>(queryKey, (current) => ({
      ...current,
      error: undefined,
      status: 'loading',
      updatedAt: Date.now()
    }));
    try {
      const data = await fetchRef.current();
      client.updateEntry<TData>(queryKey, () => ({
        data,
        error: undefined,
        status: 'success',
        updatedAt: Date.now()
      }));
      return data;
    } catch (error) {
      client.updateEntry<TData>(queryKey, (current) => ({
        ...current,
        error,
        status: 'error',
        updatedAt: Date.now()
      }));
      throw error;
    }
  }, [client, queryKey]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const current = client.getEntry<TData>(key);
    const isFresh = current && current.status === 'success' && Date.now() - current.updatedAt < staleTime;
    if (current?.status === 'loading' || isFresh) {
      return;
    }
    runFetch().catch(() => undefined);
  }, [client, key, enabled, staleTime, runFetch]);

  return {
    data: entry.data,
    error: entry.error,
    status: entry.status,
    isLoading:
      entry.status === 'idle' || (entry.status === 'loading' && typeof entry.data === 'undefined'),
    isFetching: entry.status === 'loading',
    refetch: runFetch
  };
}

export interface UseMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: unknown, variables: TVariables) => void;
}

export interface UseMutationResult<TData, TVariables> {
  mutateAsync: (variables: TVariables) => Promise<TData>;
  status: 'idle' | 'pending' | 'success' | 'error';
  error?: unknown;
  isPending: boolean;
}

export function useMutation<TData, TVariables>({
  mutationFn,
  onSuccess,
  onError
}: UseMutationOptions<TData, TVariables>): UseMutationResult<TData, TVariables> {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [error, setError] = useState<unknown>(undefined);
  const fnRef = useRef(mutationFn);
  fnRef.current = mutationFn;

  const mutateAsync = useCallback(
    async (variables: TVariables) => {
      setStatus('pending');
      setError(undefined);
      try {
        const result = await fnRef.current(variables);
        setStatus('success');
        onSuccess?.(result, variables);
        return result;
      } catch (err) {
        setStatus('error');
        setError(err);
        onError?.(err, variables);
        throw err;
      }
    },
    [onError, onSuccess]
  );

  return {
    mutateAsync,
    status,
    error,
    isPending: status === 'pending'
  };
}
