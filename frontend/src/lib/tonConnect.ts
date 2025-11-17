import { beginCell } from '@ton/core';
import { Buffer } from 'buffer';
import { TON_CONTRACT_ADDRESS } from './constants';
import type { TonConnectUIInstance } from '../types/tonconnect';

if (typeof globalThis !== 'undefined' && typeof (globalThis as any).Buffer === 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

const PAY_STAKE_OPCODE = 0x50595354;
const NANO_IN_TON = BigInt(1e9);

const toNano = (amount: number): bigint => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid TON amount');
  }
  const formatted = amount.toFixed(9);
  const [whole, fractional = ''] = formatted.split('.');
  const paddedFractional = `${fractional}000000000`.slice(0, 9);
  return BigInt(`${whole}${paddedFractional}`);
};

const encodeStakePayload = (payload: Record<string, unknown>): string => {
  const jsonBuffer = Buffer.from(JSON.stringify(payload), 'utf8');
  const cell = beginCell().storeUint(PAY_STAKE_OPCODE, 32).storeBuffer(jsonBuffer).endCell();
  return cell.toBoc({ idx: false }).toString('base64');
};

const base64ToBytes = (value: string): Uint8Array => {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return Buffer.from(value, 'base64');
};

const bytesToHex = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is unavailable');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `0x${bytesToHex(digest)}`;
};

export interface SendStakeParams {
  controller: TonConnectUIInstance;
  lobbyId: string;
  seatId: string;
  seatIndex: number;
  stakeTon: number;
  userId: string;
}

export interface SendStakeResult {
  boc: string;
  txHash: string;
}

export async function sendStakeViaTonConnect(params: SendStakeParams): Promise<SendStakeResult> {
  if (!params.controller?.sendTransaction) {
    throw new Error('TonConnect is not initialized');
  }

  const payload = encodeStakePayload({
    lobbyId: params.lobbyId,
    seatId: params.seatId,
    seatIndex: params.seatIndex,
    userId: params.userId
  });

  const validUntil = Math.floor(Date.now() / 1000) + 600;
  const response = await params.controller.sendTransaction({
    validUntil,
    messages: [
      {
        address: TON_CONTRACT_ADDRESS,
        amount: toNano(params.stakeTon).toString(),
        payload
      }
    ]
  });

  const boc = typeof response === 'string' ? response : response?.boc;
  if (!boc) {
    throw new Error('Wallet did not return a signed message');
  }

  const txHash = await sha256Hex(base64ToBytes(boc));
  return { boc, txHash };
}
