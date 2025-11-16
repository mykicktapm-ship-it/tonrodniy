import { randomUUID } from 'crypto';

type TonEventType = 'DepositReceived' | 'WinnerSelected' | 'PayoutSent';

export interface LobbyState {
  lobbyId: string;
  roundId: string;
  onChainBalanceTon: number;
  lockedStakeTon: number;
  lastRoundHash: string;
  seatsPaid: number;
  seatsTotal: number;
  lastEventType?: TonEventType;
  updatedAt: string;
}

export interface PayStakeRequest {
  lobbyId: string;
  seatId: string;
  participantWallet: string;
  amountTon: number;
}

export interface PayStakeResponse {
  txHash: string;
  status: 'accepted' | 'rejected';
  simulated: boolean;
}

export interface FinalizeRoundRequest {
  lobbyId: string;
  roundId: string;
  winnerWallet?: string;
  payoutTon?: number;
}

export interface FinalizeRoundResponse {
  roundHash: string;
  winnerWallet?: string;
  payoutTon?: number;
  txHash: string;
}

export interface WithdrawPoolRequest {
  lobbyId: string;
  treasuryWallet: string;
}

export interface WithdrawPoolResponse {
  txHash: string;
  withdrawnTon: number;
}

// TODO(F5): Replace stubs with real toncenter RPC + tonapi fallbacks and signer integration.
export const getLobbyState = async (lobbyId: string): Promise<LobbyState> => {
  console.log('[tonClient] fetching lobby state', { lobbyId });
  return {
    lobbyId,
    roundId: `round-${lobbyId}`,
    onChainBalanceTon: 10.25,
    lockedStakeTon: 8,
    lastRoundHash: '0xmockroundhash',
    seatsPaid: 4,
    seatsTotal: 6,
    lastEventType: 'DepositReceived',
    updatedAt: new Date().toISOString()
  };
};

// TODO(F5): send signed transfer to round wallet via toncenter when wiring stake flows.
export const sendPayStake = async (params: PayStakeRequest): Promise<PayStakeResponse> => {
  console.log('[tonClient] sendPayStake intent', params);
  return {
    txHash: `0xstake-${params.seatId}-${Date.now()}`,
    status: 'accepted',
    simulated: true
  };
};

// TODO(F5): finalize round via contract call + real randomness reveal, signed by operator key.
export const sendFinalizeRound = async (
  params: FinalizeRoundRequest
): Promise<FinalizeRoundResponse> => {
  console.log('[tonClient] sendFinalizeRound intent', params);
  return {
    roundHash: params.roundId ?? `0xround-${params.lobbyId}`,
    winnerWallet: params.winnerWallet,
    payoutTon: params.payoutTon ?? 0,
    txHash: `0xfinalize-${randomUUID()}`
  };
};

// TODO(F5): wire withdrawal to treasury wallet using contract getter for withdrawable pool.
export const sendWithdrawPool = async (params: WithdrawPoolRequest): Promise<WithdrawPoolResponse> => {
  console.log('[tonClient] sendWithdrawPool intent', params);
  return {
    txHash: `0xwithdraw-${randomUUID()}`,
    withdrawnTon: 3.5
  };
};
