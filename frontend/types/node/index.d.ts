declare module 'node:path' {
  export type PathLike = string;
  export function resolve(...paths: PathLike[]): string;
  export const sep: string;
  const path: {
    resolve: typeof resolve;
    sep: typeof sep;
  };
  export default path;
}

declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
}

declare const __dirname: string;
