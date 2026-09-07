"use client";

import { arcTestnet } from "@proofwork/chain";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors";

/**
 * The funder's own wallet. Proofwork never holds a funder's key — the browser signs the
 * approve and the escrow call itself, and the API only ever reads the receipt back.
 */

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: { [arcTestnet.id]: http() },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
