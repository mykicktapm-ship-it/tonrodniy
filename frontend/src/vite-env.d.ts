/// <reference types="vite/client" />

declare interface ImportMetaEnv {
  readonly VITE_TONCONNECT_MANIFEST_URL?: string;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}
