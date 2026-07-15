import { type Chain, defineChain } from "viem";

// Monad network parameters. sourceRef: https://docs.monad.xyz (Network
// Information) and the testnet add-to-wallet guide. MON uses 18 decimals, the
// EVM native-token default.
export const monadTestnet: Chain = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" },
  },
  testnet: true,
});

export const monadMainnet: Chain = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "MonadScan", url: "https://monadscan.com" },
  },
});

// Local Foundry node, for tests and local demos.
export const anvilLocal: Chain = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

export type ChainKey = "testnet" | "mainnet" | "local";

export function chainForKey(key: ChainKey): Chain {
  switch (key) {
    case "testnet":
      return monadTestnet;
    case "mainnet":
      return monadMainnet;
    case "local":
      return anvilLocal;
  }
}
