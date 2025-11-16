import { useMemo } from 'react';
import { MOCK_ROUNDS } from '../lib/constants';

type RoundFilters = {
  state?: string;
};

export function useMockRounds(filters?: RoundFilters) {
  return useMemo(() => {
    if (!filters?.state) {
      return MOCK_ROUNDS;
    }

    return MOCK_ROUNDS.filter((round) => round.state === filters.state);
  }, [filters?.state]);
}
