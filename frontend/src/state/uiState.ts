export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncState {
  status: AsyncStatus;
  message?: string;
}

export const idleState: AsyncState = {
  status: 'idle',
};
