/**
 * `cloudflare:sockets` je zabudované v runtime workera, ale pri type-checku
 * (`bunx tsc`) ho nemá kto ohlásiť — `@cloudflare/workers-types` sa v tomto
 * tsconfigu nenačítavajú. Deklarácia je úmyselne minimálna: presne to, čo
 * z modulu používa `lib/psb/imap.ts`.
 */
declare module "cloudflare:sockets" {
  export function connect(
    address: { hostname: string; port: number } | string,
    options?: { secureTransport?: "off" | "on" | "starttls"; allowHalfOpen?: boolean },
  ): {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    closed: Promise<void>;
    close(): Promise<void>;
  };
}
