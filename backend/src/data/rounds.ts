import { Round } from './types';

export const rounds: Round[] = [
  {
    id: 'round-alpha',
    lobbyId: 'lobby-alpha',
    roundHash: '0xroundhashalpha0001',
    winnerUserId: 'user-tony',
    winnerWallet: 'EQDn4TonyWalletHash0001',
    payoutAmount: 2,
    finalizedAt: '2024-03-08T11:30:00.000Z',
    txHashes: ['0xhash-alpha-0', '0xhash-alpha-1']
  },
  {
    id: 'round-beta',
    lobbyId: 'lobby-beta',
    roundHash: '0xroundhashbeta0002',
    txHashes: []
  }
];

export const getRoundById = (roundId: string) => rounds.find((round) => round.id === roundId);
