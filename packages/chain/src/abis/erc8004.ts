// ERC-8004 registries on Arc. Trimmed from the verified implementations behind the
// proxies at ADDRESSES.testnet.ERC8004_IDENTITY and ERC8004_REPUTATION, keeping only the
// entries Proofwork uses. Read from ArcScan on 7 Sept 2026.

/** Identity registry: an agent is an ERC-721 token whose URI describes it. */
export const erc8004IdentityAbi = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "agentId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "string",
        name: "agentURI",
        type: "string",
      },
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    name: "Registered",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "agentId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "string",
        name: "newURI",
        type: "string",
      },
      {
        indexed: true,
        internalType: "address",
        name: "updatedBy",
        type: "address",
      },
    ],
    name: "URIUpdated",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
    ],
    name: "balanceOf",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "agentId",
        type: "uint256",
      },
    ],
    name: "getAgentWallet",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "agentId",
        type: "uint256",
      },
    ],
    name: "isAuthorizedOrOwner",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "ownerOf",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "register",
    outputs: [
      {
        internalType: "uint256",
        name: "agentId",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "agentURI",
        type: "string",
      },
    ],
    name: "register",
    outputs: [
      {
        internalType: "uint256",
        name: "agentId",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "agentId",
        type: "uint256",
      },
      {
        internalType: "string",
        name: "newURI",
        type: "string",
      },
    ],
    name: "setAgentURI",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
    ],
    name: "tokenURI",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** Reputation registry: signed feedback about an agent, left by the client who paid it. */
export const erc8004ReputationAbi = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "agentId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "clientAddress",
        type: "address",
      },
      {
        indexed: true,
        internalType: "uint64",
        name: "feedbackIndex",
        type: "uint64",
      },
    ],
    name: "FeedbackRevoked",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "agentId",
        type: "uint256",
      },
      {
        indexed: true,
        internalType: "address",
        name: "clientAddress",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "feedbackIndex",
        type: "uint64",
      },
      {
        indexed: false,
        internalType: "int128",
        name: "value",
        type: "int128",
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "valueDecimals",
        type: "uint8",
      },
      {
        indexed: true,
        internalType: "string",
        name: "indexedTag1",
        type: "string",
      },
      {
        indexed: false,
        internalType: "string",
        name: "tag1",
        type: "string",
      },
      {
        indexed: false,
        internalType: "string",
        name: "tag2",
        type: "string",
      },
      {
        indexed: false,
        internalType: "string",
        name: "endpoint",
        type: "string",
      },
      {
        indexed: false,
        internalType: "string",
        name: "feedbackURI",
        type: "string",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "feedbackHash",
        type: "bytes32",
      },
    ],
    name: "NewFeedback",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "agentId",
        type: "uint256",
      },
    ],
    name: "getClients",
    outputs: [
      {
        internalType: "address[]",
        name: "",
        type: "address[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "agentId",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "clientAddress",
        type: "address",
      },
    ],
    name: "getLastIndex",
    outputs: [
      {
        internalType: "uint64",
        name: "",
        type: "uint64",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "agentId",
        type: "uint256",
      },
      {
        internalType: "address[]",
        name: "clientAddresses",
        type: "address[]",
      },
      {
        internalType: "string",
        name: "tag1",
        type: "string",
      },
      {
        internalType: "string",
        name: "tag2",
        type: "string",
      },
    ],
    name: "getSummary",
    outputs: [
      {
        internalType: "uint64",
        name: "count",
        type: "uint64",
      },
      {
        internalType: "int128",
        name: "summaryValue",
        type: "int128",
      },
      {
        internalType: "uint8",
        name: "summaryValueDecimals",
        type: "uint8",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "agentId",
        type: "uint256",
      },
      {
        internalType: "int128",
        name: "value",
        type: "int128",
      },
      {
        internalType: "uint8",
        name: "valueDecimals",
        type: "uint8",
      },
      {
        internalType: "string",
        name: "tag1",
        type: "string",
      },
      {
        internalType: "string",
        name: "tag2",
        type: "string",
      },
      {
        internalType: "string",
        name: "endpoint",
        type: "string",
      },
      {
        internalType: "string",
        name: "feedbackURI",
        type: "string",
      },
      {
        internalType: "bytes32",
        name: "feedbackHash",
        type: "bytes32",
      },
    ],
    name: "giveFeedback",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "agentId",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "clientAddress",
        type: "address",
      },
      {
        internalType: "uint64",
        name: "feedbackIndex",
        type: "uint64",
      },
    ],
    name: "readFeedback",
    outputs: [
      {
        internalType: "int128",
        name: "value",
        type: "int128",
      },
      {
        internalType: "uint8",
        name: "valueDecimals",
        type: "uint8",
      },
      {
        internalType: "string",
        name: "tag1",
        type: "string",
      },
      {
        internalType: "string",
        name: "tag2",
        type: "string",
      },
      {
        internalType: "bool",
        name: "isRevoked",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "agentId",
        type: "uint256",
      },
      {
        internalType: "uint64",
        name: "feedbackIndex",
        type: "uint64",
      },
    ],
    name: "revokeFeedback",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
