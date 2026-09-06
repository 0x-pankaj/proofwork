import { createPublicClient, http, type PublicClient } from "viem";
import { type ChainEnv, chainEnv } from "./env";
import { type ArcNetwork, activeNetwork, chainFor, rpcUrlFor } from "./networks";

/** A read-only client for a network. */
export function publicClientFor(network: ArcNetwork, env: ChainEnv = chainEnv()): PublicClient {
  return createPublicClient({
    chain: chainFor(network, env),
    transport: http(rpcUrlFor(network, env)),
  }) as PublicClient;
}

/** A read-only client for the network this process is configured for. */
export function publicClient(env: ChainEnv = chainEnv()): PublicClient {
  return publicClientFor(activeNetwork(env), env);
}
