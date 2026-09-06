// Generated from packages/contracts by "bun run contracts:export". Do not edit.

export const proofworkJobsAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "contract IERC20",
      },
      {
        name: "treasury_",
        type: "address",
        internalType: "address",
      },
      {
        name: "feeBps_",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "owner_",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "MAX_DURATION",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_FEE_BPS",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint16",
        internalType: "uint16",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_MAINTAINER_REWARD_BPS",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint16",
        internalType: "uint16",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MIN_DURATION",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "acceptOwnership",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "cancel",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimRefund",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "complete",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "reason",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createAndFund",
    inputs: [
      {
        name: "evaluator",
        type: "address",
        internalType: "address",
      },
      {
        name: "expiredAt",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "description",
        type: "string",
        internalType: "string",
      },
      {
        name: "budget",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "maintainer",
        type: "address",
        internalType: "address",
      },
      {
        name: "maintainerRewardBps",
        type: "uint16",
        internalType: "uint16",
      },
    ],
    outputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createJob",
    inputs: [
      {
        name: "provider",
        type: "address",
        internalType: "address",
      },
      {
        name: "evaluator",
        type: "address",
        internalType: "address",
      },
      {
        name: "expiredAt",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "description",
        type: "string",
        internalType: "string",
      },
      {
        name: "hook",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "feeBps",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint16",
        internalType: "uint16",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "feeFor",
    inputs: [
      {
        name: "budget",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "fund",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getJob",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct IERC8183.Job",
        components: [
          {
            name: "id",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "client",
            type: "address",
            internalType: "address",
          },
          {
            name: "provider",
            type: "address",
            internalType: "address",
          },
          {
            name: "evaluator",
            type: "address",
            internalType: "address",
          },
          {
            name: "description",
            type: "string",
            internalType: "string",
          },
          {
            name: "budget",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "expiredAt",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "status",
            type: "uint8",
            internalType: "enum IERC8183.JobStatus",
          },
          {
            name: "hook",
            type: "address",
            internalType: "address",
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getJobExtra",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct IProofworkJobs.JobExtra",
        components: [
          {
            name: "maintainer",
            type: "address",
            internalType: "address",
          },
          {
            name: "maintainerRewardBps",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "fee",
            type: "uint256",
            internalType: "uint256",
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "jobCount",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "pause",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "paused",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "paymentToken",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IERC20",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "pendingOwner",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "reject",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "reason",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "renounceOwnership",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setBudget",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setFeeConfig",
    inputs: [
      {
        name: "newFeeBps",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "newTreasury",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setProvider",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "provider_",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "settle",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "provider",
        type: "address",
        internalType: "address",
      },
      {
        name: "deliverable",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "reason",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "splitFor",
    inputs: [
      {
        name: "budget",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "maintainerRewardBps",
        type: "uint16",
        internalType: "uint16",
      },
    ],
    outputs: [
      {
        name: "contributorAmount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "maintainerAmount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "feeAmount",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "submit",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "deliverable",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "treasury",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "unpause",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "BudgetSet",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "FeeCollected",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "FeeConfigured",
    inputs: [
      {
        name: "feeBps",
        type: "uint16",
        indexed: false,
        internalType: "uint16",
      },
      {
        name: "treasury",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "JobCancelled",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "client",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "JobCompleted",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "evaluator",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "reason",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "JobCreated",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "client",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "provider",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "evaluator",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "expiredAt",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "hook",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "JobExpired",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "JobFunded",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "client",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "JobRejected",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "rejector",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "reason",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "JobSubmitted",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "provider",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "deliverable",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "MaintainerRewardPaid",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "maintainer",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OwnershipTransferStarted",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Paused",
    inputs: [
      {
        name: "account",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PaymentReleased",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "provider",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ProviderSet",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "provider",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Refunded",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
      },
      {
        name: "client",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Unpaused",
    inputs: [
      {
        name: "account",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "EnforcedPause",
    inputs: [],
  },
  {
    type: "error",
    name: "ExpectedPause",
    inputs: [],
  },
  {
    type: "error",
    name: "ExpiryOutOfRange",
    inputs: [
      {
        name: "expiredAt",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "FeeTooHigh",
    inputs: [
      {
        name: "provided",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "maximum",
        type: "uint16",
        internalType: "uint16",
      },
    ],
  },
  {
    type: "error",
    name: "HooksNotSupported",
    inputs: [],
  },
  {
    type: "error",
    name: "NotClient",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "caller",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "NotClientOrProvider",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "caller",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "NotEvaluator",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "caller",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "NotProvider",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "caller",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "NotYetExpired",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "expiredAt",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "OwnableInvalidOwner",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "OwnableUnauthorizedAccount",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ProviderAlreadyAssigned",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "ProviderNotAssigned",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "ReentrancyGuardReentrantCall",
    inputs: [],
  },
  {
    type: "error",
    name: "RewardTooHigh",
    inputs: [
      {
        name: "provided",
        type: "uint16",
        internalType: "uint16",
      },
      {
        name: "maximum",
        type: "uint16",
        internalType: "uint16",
      },
    ],
  },
  {
    type: "error",
    name: "RewardWithoutMaintainer",
    inputs: [],
  },
  {
    type: "error",
    name: "SafeERC20FailedOperation",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "UnknownJob",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "WrongStatus",
    inputs: [
      {
        name: "jobId",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "actual",
        type: "uint8",
        internalType: "enum IERC8183.JobStatus",
      },
    ],
  },
  {
    type: "error",
    name: "ZeroAddress",
    inputs: [],
  },
  {
    type: "error",
    name: "ZeroBudget",
    inputs: [],
  },
] as const;
