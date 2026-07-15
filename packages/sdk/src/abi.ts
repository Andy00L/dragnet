// Generated from contracts/out/DragnetMarket.sol/DragnetMarket.json by scripts/gen-abi.ts. Do not edit by hand.

export const dragnetMarketAbi = [
  {
    "type": "function",
    "name": "bounties",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "buyer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum DragnetMarket.Status"
      },
      {
        "name": "m",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "claimDeadline",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "openDeadline",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "lo",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "hi",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "targetRoot",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "payout",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "bond",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "winner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bountyCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "commit",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "commitHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "commits",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "worker",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "hash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "blockNumber",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getBounty",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct DragnetMarket.Bounty",
        "components": [
          {
            "name": "buyer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum DragnetMarket.Status"
          },
          {
            "name": "m",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "claimDeadline",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "openDeadline",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "lo",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "hi",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "targetRoot",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "payout",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "bond",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "winner",
            "type": "address",
            "internalType": "address"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "openBounty",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "keys",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "px",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "py",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "proofs",
        "type": "bytes32[][]",
        "internalType": "bytes32[][]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "pendingWithdrawals",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "postBounty",
    "inputs": [
      {
        "name": "lo",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "hi",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "m",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "targetRoot",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "payout",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "bond",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "claimWindow",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "openWindow",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "targetList",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "reveal",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "keys",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "px",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "py",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "proofs",
        "type": "bytes32[][]",
        "internalType": "bytes32[][]"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "slash",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdraw",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "BountyPosted",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "buyer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "lo",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "hi",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "m",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "targetRoot",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "payout",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "bond",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "claimDeadline",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "openDeadline",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "targetList",
        "type": "bytes",
        "indexed": false,
        "internalType": "bytes"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Committed",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "worker",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Paid",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "worker",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "payout",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Refunded",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "buyer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Slashed",
    "inputs": [
      {
        "name": "bountyId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "committer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Withdrawn",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "BadPublicKey",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BondZero",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BountyNotOpen",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ClaimWindowClosed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ClaimWindowOpen",
    "inputs": []
  },
  {
    "type": "error",
    "name": "CommitMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "CountInvalid",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EmptyCommit",
    "inputs": []
  },
  {
    "type": "error",
    "name": "KeyOutOfRange",
    "inputs": []
  },
  {
    "type": "error",
    "name": "KeysNotAscending",
    "inputs": []
  },
  {
    "type": "error",
    "name": "LengthMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotBuyer",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotCommitted",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotListed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToWithdraw",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OpenWindowOpen",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PayoutZero",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RangeInvalid",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Reentrancy",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RevealTooSoon",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RootZero",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnknownBounty",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ValueMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "WindowInvalid",
    "inputs": []
  },
  {
    "type": "error",
    "name": "WithdrawFailed",
    "inputs": []
  }
] as const;
