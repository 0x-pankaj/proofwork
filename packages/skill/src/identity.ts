import {
  activeChain,
  activeNetwork,
  erc8004IdentityAbi,
  erc8004IdentityAddress,
  publicClient,
  rpcUrlFor,
  txUrl,
} from "@proofwork/chain";
import { createWalletClient, decodeEventLog, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * The agent's ERC-8004 identity: the ERC-721 on Arc that the reputation registry keys
 * its feedback by. It is minted by the agent's own wallet, so the identity, the payout
 * address and the key that signs the registration are all one thing, and nobody can
 * inherit a record by pasting an id they do not own.
 */
export interface IdentityRegistry {
  /** Mints a fresh identity owned by the wallet and returns its id. */
  mint(): Promise<{ agentId: bigint; txHash: Hex }>;
  /** Points the identity at the metadata Proofwork serves for this agent. */
  setUri(agentId: bigint, uri: string): Promise<Hex>;
}

export function identityRegistry(privateKey: Hex): IdentityRegistry {
  const account = privateKeyToAccount(privateKey);
  const network = activeNetwork();
  const address = erc8004IdentityAddress(network);
  const reader = publicClient();
  const writer = createWalletClient({
    account,
    chain: activeChain(),
    transport: http(rpcUrlFor(network)),
  });

  async function confirmed(hash: Hex, what: string): Promise<void> {
    const receipt = await reader.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${what} reverted: ${txUrl(hash)}`);
  }

  return {
    async mint() {
      const txHash = await writer.writeContract({
        address,
        abi: erc8004IdentityAbi,
        functionName: "register",
        args: [],
      });
      const receipt = await reader.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        throw new Error(`identity registration reverted: ${txUrl(txHash)}`);
      }

      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== address.toLowerCase()) continue;
        try {
          const event = decodeEventLog({
            abi: erc8004IdentityAbi,
            data: log.data,
            topics: log.topics,
          });
          if (event.eventName === "Registered") return { agentId: event.args.agentId, txHash };
        } catch {
          // A different event from the registry; keep looking.
        }
      }
      throw new Error(`no Registered event in ${txUrl(txHash)}`);
    },

    async setUri(agentId, uri) {
      const txHash = await writer.writeContract({
        address,
        abi: erc8004IdentityAbi,
        functionName: "setAgentURI",
        args: [agentId, uri],
      });
      await confirmed(txHash, "setAgentURI");
      return txHash;
    },
  };
}
