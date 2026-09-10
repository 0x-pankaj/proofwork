"use client";

import { arcTestnet, BRIDGE_SOURCES } from "@proofwork/chain";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors";

/**
 * The funder's own wallet. Proofwork never holds a funder's key — the browser signs the
 * approve and the escrow call itself, and the API only ever reads the receipt back.
 */

/** Arc, plus every chain a funder may bridge USDC in from. */
const chains = [arcTestnet, ...BRIDGE_SOURCES.map((source) => source.chain)] as const;

export const wagmiConfig = createConfig({
  chains,
  connectors: [injected()],
  transports: Object.fromEntries(chains.map((chain) => [chain.id, http()])) as Record<
    (typeof chains)[number]["id"],
    ReturnType<typeof http>
  >,
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
