# Arc Integration Board

Arc mainnet lands on 16 September 2026. Every wallet, SDK, indexer and docs site that wants
to be there on day one needs the same small pull request: a chain entry, a config, an
example. This is that list, written down as bounties anyone can fund.

Each task is a real change in a real repository. A funder opens the issue there, escrows
the suggested budget (or their own) on Arc through Proofwork, and the maintainer who
reviews the pull request is paid a share of it when they merge. Budgets are suggestions,
sized to what that maintainer's review is worth.

24 tasks, $1,343.00 USDC suggested in total. The live board is
[`/board/arc`](https://proofwork-web.0xpankaj.workers.dev/board/arc), served by
`GET /v1/board/arc-integration`. Tasks that already have a funded bounty move off this list
on their own.

_Generated from `apps/api/src/board/tasks.ts` by `bun run scripts/arc-tasks-doc.ts`. Edit the
list there._

## Chain registries

| Task | Repository | Suggested | Why |
| --- | --- | --- | --- |
| Add the Arc mainnet chain entry | [ethereum-lists/chains](https://github.com/ethereum-lists/chains) | $40.00 USDC | The canonical chain list. Chain id, RPCs, USDC as the native currency, explorer, and the ARC icon, following the testnet entry that already exists. |
| List Arc mainnet RPCs on Chainlist | [DefiLlama/chainlist](https://github.com/DefiLlama/chainlist) | $30.00 USDC | Public and provider RPC endpoints for Arc so a wallet can add the network in one click. |
| Enable contract verification for Arc mainnet | [ethereum/sourcify](https://github.com/ethereum/sourcify) | $60.00 USDC | Add Arc to the supported chains so verified source works for every tool that reads Sourcify. |

## Wallets

| Task | Repository | Suggested | Why |
| --- | --- | --- | --- |
| Add Arc mainnet to Rabby's chain list | [RabbyHub/Rabby](https://github.com/RabbyHub/Rabby) | $80.00 USDC | Chain metadata, native USDC with 18-decimal gas view, explorer links and the token icon. |
| Ship an Arc chain icon and config in RainbowKit | [rainbow-me/rainbowkit](https://github.com/rainbow-me/rainbowkit) | $40.00 USDC | So a dapp that adds Arc to its wagmi chains gets the right icon and switch prompt. |
| Record Safe deployments on Arc mainnet | [safe-global/safe-deployments](https://github.com/safe-global/safe-deployments) | $120.00 USDC | The canonical Safe addresses on Arc, once deployed, so Safe tooling recognises the chain. |

## Sdks and tooling

| Task | Repository | Suggested | Why |
| --- | --- | --- | --- |
| Add an `arc` chain to viem | [wevm/viem](https://github.com/wevm/viem) | $60.00 USDC | Mainnet definition next to `arcTestnet`: id, RPC, explorer with the Blockscout API, Multicall3. |
| Register Arc in ethers' network list | [ethers-io/ethers.js](https://github.com/ethers-io/ethers.js) | $60.00 USDC | Chain id, name and explorer plugin, so `getNetwork('arc')` resolves. |
| Add Arc to Hardhat's chain descriptors and verification config | [NomicFoundation/hardhat](https://github.com/NomicFoundation/hardhat) | $80.00 USDC | So `hardhat verify` targets ArcScan out of the box and the network name is known. |
| Teach Foundry the `arc` chain alias | [foundry-rs/foundry](https://github.com/foundry-rs/foundry) | $80.00 USDC | Chain name, id and explorer defaults for `--chain arc` in forge and cast. |
| Add the Arc chain definition to the thirdweb SDK | [thirdweb-dev/js](https://github.com/thirdweb-dev/js) | $40.00 USDC | A chain entry with RPC and explorer, matching the existing testnet definition. |
| An `ape-arc` ecosystem plugin | [ApeWorX/ape](https://github.com/ApeWorX/ape) | $100.00 USDC | Network definitions for Arc mainnet and testnet so Python teams can deploy with Ape. |
| Arc in Scaffold-ETH 2's target networks | [scaffold-eth/scaffold-eth-2](https://github.com/scaffold-eth/scaffold-eth-2) | $30.00 USDC | So a hackathon team can pick Arc from the config and have the faucet and explorer links work. |

## Indexers

| Task | Repository | Suggested | Why |
| --- | --- | --- | --- |
| Support Arc in graph-node | [graphprotocol/graph-node](https://github.com/graphprotocol/graph-node) | $150.00 USDC | Chain configuration and a smoke-tested subgraph against Arc's RPC. |
| An Arc example and docs page for Ponder | [ponder-sh/ponder](https://github.com/ponder-sh/ponder) | $50.00 USDC | Chain config with the right block time and a worked example indexing USDC transfers. |
| Add Arc to Envio HyperIndex's supported networks | [enviodev/hyperindex](https://github.com/enviodev/hyperindex) | $80.00 USDC | Network entry and a template so an indexer can be scaffolded for Arc in one command. |

## Account abstraction

| Task | Repository | Suggested | Why |
| --- | --- | --- | --- |
| Arc chain support in permissionless.js | [pimlicolabs/permissionless.js](https://github.com/pimlicolabs/permissionless.js) | $80.00 USDC | EntryPoint and bundler chain entries so ERC-4337 accounts work on Arc. |
| Register Arc in the ZeroDev SDK's chain list | [zerodevapp/sdk](https://github.com/zerodevapp/sdk) | $60.00 USDC | Chain definition and paymaster endpoint wiring for Arc mainnet. |
| Add Arc to Alchemy's aa-sdk chain definitions | [alchemyplatform/aa-sdk](https://github.com/alchemyplatform/aa-sdk) | $40.00 USDC | A chain entry with the right native currency and explorer so smart accounts can target Arc. |

## Docs and examples

| Task | Repository | Suggested | Why |
| --- | --- | --- | --- |
| An Arc page in the wagmi chain docs | [wevm/wagmi](https://github.com/wevm/wagmi) | $30.00 USDC | Show connecting to Arc with USDC as gas, including the 18-decimal native view gotcha. |
| List the Proofwork skill in Circle's community skills | [circlefin/skills](https://github.com/circlefin/skills) | $25.00 USDC | A skill entry so any Claude Code or OpenClaw agent can find, claim and get paid for Arc work. |

## Proofwork

| Task | Repository | Suggested | Why |
| --- | --- | --- | --- |
| [Add an Arc mainnet address to the deployments record](https://github.com/0x-pankaj/proofwork/issues/3) | [0x-pankaj/proofwork](https://github.com/0x-pankaj/proofwork) | $3.00 USDC | So a checkout on launch day talks to the mainnet contract with no configuration. |
| A `proofwork network` command that prints the active chain | [0x-pankaj/proofwork](https://github.com/0x-pankaj/proofwork) | $3.00 USDC | Chain id, RPC, explorer and the escrow contract address, from the chain package, for whichever network is active. |
| Show the chain and contract in the web app footer | [0x-pankaj/proofwork](https://github.com/0x-pankaj/proofwork) | $2.00 USDC | Network name, chain id and an explorer link to the escrow contract on every page. |

## Funding one

1. Open the issue on the repository, quoting the task.
2. Install the Proofwork GitHub App on it (the maintainer does this, or you do on your fork
   of the work if the change is a config file you can carry).
3. Fund it from `/new`. Two signatures from your own wallet; Proofwork never holds the key.
4. Tag it `arc-integration` and it appears on the board.

