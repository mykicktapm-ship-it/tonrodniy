import { TxLog } from './types';

export const txLogs: TxLog[] = [
  {
    id: 'tx-log-alpha-0',
    lobbyId: 'lobby-alpha',
    roundId: 'round-alpha',
    txHash: '0xhash-alpha-0',
    wallet: 'EQDn4TonyWalletHash0001',
    amountTon: 1,
    eventType: 'DepositReceived',
    payload: { seatIndex: 0 },
    createdAt: '2024-03-08T10:07:00.000Z'
  },
  {
    id: 'tx-log-alpha-1',
    lobbyId: 'lobby-alpha',
    roundId: 'round-alpha',
    txHash: '0xhash-alpha-1',
    wallet: 'EQDn4EveWalletHash0002',
    amountTon: 1,
    eventType: 'DepositReceived',
    payload: { seatIndex: 1 },
    createdAt: '2024-03-08T10:08:00.000Z'
  }
];

export const listTxLogs = () => txLogs;

export const appendTxLog = (log: TxLog) => {
  txLogs.push(log);
  return log;
};
