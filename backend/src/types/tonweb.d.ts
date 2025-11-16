declare module 'tonweb' {
  export namespace utils {
    class BN {
      constructor(value: string | number | bigint);
      toString(base?: number): string;
    }

    class Address {
      constructor(address: string);
      toString(userFriendly?: boolean, urlSafe?: boolean, bounceable?: boolean, testOnly?: boolean): string;
    }
  }

  export namespace boc {
    class Cell {
      static oneFromBoc(source: Buffer | Uint8Array): Cell;
      toBoc(options?: { idx?: boolean }): Buffer;
    }
  }

  export interface ProviderResponse<TStack = unknown[]> {
    exit_code?: number | string;
    stack?: TStack;
    [key: string]: unknown;
  }

  export interface Provider {
    getAddressInfo(address: string): Promise<{ balance?: string | number | bigint }>;
    sendBocReturnHash?(boc: Buffer | Uint8Array): Promise<{ hash?: string; transaction?: { hash?: string } }>;
    sendBoc(boc: Buffer | Uint8Array): Promise<void>;
    call(address: string, method: string, params?: unknown[]): Promise<ProviderResponse>;
  }

  export class HttpProvider {
    constructor(endpoint: string, options?: { apiKey?: string });
  }

  export interface WalletAddress {
    toString(userFriendly?: boolean, urlSafe?: boolean, bounceable?: boolean, testOnly?: boolean): string;
  }

  export interface WalletTransferParams {
    secretKey: Uint8Array;
    toAddress: string;
    amount: utils.BN;
    seqno: number;
    payload?: unknown;
    sendMode?: number;
  }

  export interface WalletTransfer {
    send(): Promise<void>;
    getQuery?(): Promise<string | Buffer | Uint8Array>;
  }

  export interface WalletMethods {
    seqno(): { call(): Promise<number | string> };
    transfer(params: WalletTransferParams): WalletTransfer;
  }

  export interface WalletInstance {
    methods: WalletMethods;
    getAddress(): Promise<WalletAddress>;
  }

  export interface WalletFactory {
    new (
      provider: HttpProvider,
      options?: { publicKey: Uint8Array; secretKey?: Uint8Array; wc?: number }
    ): WalletInstance;
  }

  export namespace wallet {
    const all: { v4R2: WalletFactory };
  }

  export default class TonWeb {
    constructor(provider?: HttpProvider);
    static HttpProvider: typeof HttpProvider;
    static utils: typeof utils;
    static boc: typeof boc;
    static wallet: typeof wallet;
    wallet: typeof wallet;
    provider: Provider;
  }
}
