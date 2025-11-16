export interface FakeTransactionPayload {
  to: string;
  amount: number;
  comment?: string;
}

export interface FakeTransactionResult {
  hash: string;
  status: 'success';
  sentAt: number;
}

const randomHex = () => Math.random().toString(16).slice(2, 10);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sendFakeTransaction(payload: FakeTransactionPayload): Promise<FakeTransactionResult> {
  console.debug('[fakeTonService] Sending fake transaction payload', payload);
  // TODO: replace with tonConnectUI.sendTransaction once the smart-contract flow is wired up
  const delay = 1200 + Math.floor(Math.random() * 1200);
  await wait(delay);

  const result: FakeTransactionResult = {
    hash: `0x${randomHex()}${randomHex()}`,
    status: 'success',
    sentAt: Date.now(),
  };

  console.debug('[fakeTonService] Fake transaction response', result);
  return result;
}
