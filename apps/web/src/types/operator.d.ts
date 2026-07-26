export {};

declare global {
  interface Window {
    eraOperator?: {
      getConfig: () => Promise<{ targetUrl?: string }>;
      saveConfig: (targetUrl: string) => Promise<{ ok: true }>;
    };
  }
}
