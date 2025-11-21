import { Buffer } from 'buffer';

const globalAny = globalThis as typeof globalThis & { Buffer?: typeof Buffer };

if (typeof globalAny.Buffer === 'undefined') {
  globalAny.Buffer = Buffer;
}

export {};
