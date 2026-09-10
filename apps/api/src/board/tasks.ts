/**
 * The Arc Integration Board.
 *
 * Arc mainnet lands on 16 September, and every wallet, SDK, indexer and docs site that
 * wants to be there on day one needs the same small pull request: a chain entry, a config,
 * an example. These are those pull requests, written down as tasks anyone can fund. A task
 * with an issue already open links to it; the rest are suggestions until a funder picks
 * one, opens the issue on the repository and escrows the money against it.
 *
 * Budgets are suggestions, sized to what a maintainer's review of that change is worth.
 */

export const ARC_INTEGRATION_TAG = "arc-integration";

export type ArcTaskCategory =
  | "chain registries"
  | "wallets"
  | "sdks and tooling"
  | "indexers"
  | "account abstraction"
  | "docs and examples"
  | "proofwork";

export interface ArcTask {
  id: string;
  title: string;
  repo: string;
  category: ArcTaskCategory;
  summary: string;
  /** 6-decimal USDC, as a string for the wire. */
  suggestedBudgetUsdc: string;
  /** Set once the issue exists on the repository. */
  issueUrl?: string;
}

const usd = (dollars: number) => String(BigInt(dollars) * 1_000_000n);

export const ARC_INTEGRATION_TASKS: ArcTask[] = [
  // Chain registries: everything downstream reads these.
  {
    id: "chains-arc-mainnet",
    title: "Add the Arc mainnet chain entry",
    repo: "ethereum-lists/chains",
    category: "chain registries",
    summary:
      "The canonical chain list. Chain id, RPCs, USDC as the native currency, explorer, and the ARC icon, following the testnet entry that already exists.",
    suggestedBudgetUsdc: usd(40),
  },
  {
    id: "chainlist-arc",
    title: "List Arc mainnet RPCs on Chainlist",
    repo: "DefiLlama/chainlist",
    category: "chain registries",
    summary:
      "Public and provider RPC endpoints for Arc so a wallet can add the network in one click.",
    suggestedBudgetUsdc: usd(30),
  },
  {
    id: "sourcify-arc",
    title: "Enable contract verification for Arc mainnet",
    repo: "ethereum/sourcify",
    category: "chain registries",
    summary:
      "Add Arc to the supported chains so verified source works for every tool that reads Sourcify.",
    suggestedBudgetUsdc: usd(60),
  },

  // Wallets.
  {
    id: "rabby-arc",
    title: "Add Arc mainnet to Rabby's chain list",
    repo: "RabbyHub/Rabby",
    category: "wallets",
    summary:
      "Chain metadata, native USDC with 18-decimal gas view, explorer links and the token icon.",
    suggestedBudgetUsdc: usd(80),
  },
  {
    id: "rainbowkit-arc",
    title: "Ship an Arc chain icon and config in RainbowKit",
    repo: "rainbow-me/rainbowkit",
    category: "wallets",
    summary: "So a dapp that adds Arc to its wagmi chains gets the right icon and switch prompt.",
    suggestedBudgetUsdc: usd(40),
  },
  {
    id: "safe-deployments-arc",
    title: "Record Safe deployments on Arc mainnet",
    repo: "safe-global/safe-deployments",
    category: "wallets",
    summary:
      "The canonical Safe addresses on Arc, once deployed, so Safe tooling recognises the chain.",
    suggestedBudgetUsdc: usd(120),
  },

  // SDKs and tooling.
  {
    id: "viem-arc-mainnet",
    title: "Add an `arc` chain to viem",
    repo: "wevm/viem",
    category: "sdks and tooling",
    summary:
      "Mainnet definition next to `arcTestnet`: id, RPC, explorer with the Blockscout API, Multicall3.",
    suggestedBudgetUsdc: usd(60),
  },
  {
    id: "ethers-arc",
    title: "Register Arc in ethers' network list",
    repo: "ethers-io/ethers.js",
    category: "sdks and tooling",
    summary: "Chain id, name and explorer plugin, so `getNetwork('arc')` resolves.",
    suggestedBudgetUsdc: usd(60),
  },
  {
    id: "hardhat-arc",
    title: "Add Arc to Hardhat's chain descriptors and verification config",
    repo: "NomicFoundation/hardhat",
    category: "sdks and tooling",
    summary: "So `hardhat verify` targets ArcScan out of the box and the network name is known.",
    suggestedBudgetUsdc: usd(80),
  },
  {
    id: "foundry-arc-alias",
    title: "Teach Foundry the `arc` chain alias",
    repo: "foundry-rs/foundry",
    category: "sdks and tooling",
    summary: "Chain name, id and explorer defaults for `--chain arc` in forge and cast.",
    suggestedBudgetUsdc: usd(80),
  },
  {
    id: "thirdweb-arc",
    title: "Add the Arc chain definition to the thirdweb SDK",
    repo: "thirdweb-dev/js",
    category: "sdks and tooling",
    summary: "A chain entry with RPC and explorer, matching the existing testnet definition.",
    suggestedBudgetUsdc: usd(40),
  },
  {
    id: "ape-arc",
    title: "An `ape-arc` ecosystem plugin",
    repo: "ApeWorX/ape",
    category: "sdks and tooling",
    summary: "Network definitions for Arc mainnet and testnet so Python teams can deploy with Ape.",
    suggestedBudgetUsdc: usd(100),
  },
  {
    id: "scaffold-eth-arc",
    title: "Arc in Scaffold-ETH 2's target networks",
    repo: "scaffold-eth/scaffold-eth-2",
    category: "sdks and tooling",
    summary:
      "So a hackathon team can pick Arc from the config and have the faucet and explorer links work.",
    suggestedBudgetUsdc: usd(30),
  },

  // Indexers.
  {
    id: "graph-node-arc",
    title: "Support Arc in graph-node",
    repo: "graphprotocol/graph-node",
    category: "indexers",
    summary: "Chain configuration and a smoke-tested subgraph against Arc's RPC.",
    suggestedBudgetUsdc: usd(150),
  },
  {
    id: "ponder-arc",
    title: "An Arc example and docs page for Ponder",
    repo: "ponder-sh/ponder",
    category: "indexers",
    summary: "Chain config with the right block time and a worked example indexing USDC transfers.",
    suggestedBudgetUsdc: usd(50),
  },
  {
    id: "envio-arc",
    title: "Add Arc to Envio HyperIndex's supported networks",
    repo: "enviodev/hyperindex",
    category: "indexers",
    summary: "Network entry and a template so an indexer can be scaffolded for Arc in one command.",
    suggestedBudgetUsdc: usd(80),
  },

  // Account abstraction.
  {
    id: "permissionless-arc",
    title: "Arc chain support in permissionless.js",
    repo: "pimlicolabs/permissionless.js",
    category: "account abstraction",
    summary: "EntryPoint and bundler chain entries so ERC-4337 accounts work on Arc.",
    suggestedBudgetUsdc: usd(80),
  },
  {
    id: "zerodev-arc",
    title: "Register Arc in the ZeroDev SDK's chain list",
    repo: "zerodevapp/sdk",
    category: "account abstraction",
    summary: "Chain definition and paymaster endpoint wiring for Arc mainnet.",
    suggestedBudgetUsdc: usd(60),
  },
  {
    id: "aa-sdk-arc",
    title: "Add Arc to Alchemy's aa-sdk chain definitions",
    repo: "alchemyplatform/aa-sdk",
    category: "account abstraction",
    summary:
      "A chain entry with the right native currency and explorer so smart accounts can target Arc.",
    suggestedBudgetUsdc: usd(40),
  },

  // Docs and examples.
  {
    id: "wagmi-arc-docs",
    title: "An Arc page in the wagmi chain docs",
    repo: "wevm/wagmi",
    category: "docs and examples",
    summary:
      "Show connecting to Arc with USDC as gas, including the 18-decimal native view gotcha.",
    suggestedBudgetUsdc: usd(30),
  },
  {
    id: "circle-skills-proofwork",
    title: "List the Proofwork skill in Circle's community skills",
    repo: "circlefin/skills",
    category: "docs and examples",
    summary:
      "A skill entry so any Claude Code or OpenClaw agent can find, claim and get paid for Arc work.",
    suggestedBudgetUsdc: usd(25),
  },

  // Our own repository, where these can be funded today.
  {
    id: "proofwork-mainnet-address",
    title: "Add an Arc mainnet address to the deployments record",
    repo: "0x-pankaj/proofwork",
    category: "proofwork",
    summary: "So a checkout on launch day talks to the mainnet contract with no configuration.",
    suggestedBudgetUsdc: usd(3),
    issueUrl: "https://github.com/0x-pankaj/proofwork/issues/3",
  },
  {
    id: "proofwork-network-command",
    title: "A `proofwork network` command that prints the active chain",
    repo: "0x-pankaj/proofwork",
    category: "proofwork",
    summary:
      "Chain id, RPC, explorer and the escrow contract address, from the chain package, for whichever network is active.",
    suggestedBudgetUsdc: usd(3),
  },
  {
    id: "proofwork-footer-chain",
    title: "Show the chain and contract in the web app footer",
    repo: "0x-pankaj/proofwork",
    category: "proofwork",
    summary: "Network name, chain id and an explorer link to the escrow contract on every page.",
    suggestedBudgetUsdc: usd(2),
  },
];
