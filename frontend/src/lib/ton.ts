export function truncateAddress(address: string, size = 4) {
  if (!address) return '';
  const start = address.slice(0, size + 2);
  const end = address.slice(-size);
  return `${start}…${end}`;
}

export function tonToNano(amountTon: number) {
  if (!Number.isFinite(amountTon)) {
    throw new Error('Invalid TON amount');
  }
  const nano = Math.round(amountTon * 1_000_000_000);
  return BigInt(nano).toString();
}

export function textToBase64(message: string) {
  if (!message) return undefined;
  try {
    if (typeof window !== 'undefined' && window.btoa) {
      return window.btoa(unescape(encodeURIComponent(message)));
    }
    if (typeof globalThis !== 'undefined') {
      const encoder = (globalThis as typeof globalThis & { btoa?: typeof window.btoa }).btoa;
      if (encoder) {
        return encoder(unescape(encodeURIComponent(message)));
      }
    }
  } catch (error) {
    console.error('Failed to encode comment to base64', error);
    return undefined;
  }
  return undefined;
}

export function describeTonConnectError(error: unknown) {
  if (!error) {
    return 'Unknown TON Connect error';
  }
  const maybe = error as { code?: number; message?: string };
  switch (maybe.code) {
    case 4001:
      return 'User rejected the request.';
    case 4100:
      return 'Request is not authorized for the connected wallet.';
    case 5000:
      return 'Wallet returned an unexpected error.';
    default:
      break;
  }
  const message = maybe.message || String(error);
  if (message.toLowerCase().includes('balance')) {
    return 'Wallet reported insufficient balance.';
  }
  if (message.toLowerCase().includes('timeout')) {
    return 'Wallet request timed out. Try again.';
  }
  return message;
}
