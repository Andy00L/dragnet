#!/usr/bin/env bash
# Deploy DragnetMarket to the chain configured in the repo-root .env, then wire the
# address into .env and apps/web/.env.local so both the CLI packages and the web app
# read the live contract. Prints the address and the Vercel env var to set.
#
# Prerequisites (repo-root .env, gitignored):
#   PRIVATE_KEY       funded deployer key (testnet MON from https://faucet.monad.xyz)
#   DRAGNET_RPC_URL   optional; defaults to Monad testnet
#   DRAGNET_CHAIN     optional; testnet (default) | mainnet | local
#
# The private key is loaded into the environment for forge and is never printed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "[deploy-market] no $ENV_FILE; create it with PRIVATE_KEY set" >&2
  exit 1
fi

# Load .env without echoing it.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [ -z "${PRIVATE_KEY:-}" ]; then
  echo "[deploy-market] PRIVATE_KEY is not set in $ENV_FILE" >&2
  exit 1
fi

RPC_URL="${DRAGNET_RPC_URL:-https://testnet-rpc.monad.xyz}"
CHAIN_KEY="${DRAGNET_CHAIN:-testnet}"

echo "[deploy-market] deploying DragnetMarket to $RPC_URL ($CHAIN_KEY) ..."
cd "$ROOT/contracts"
# forge reads PRIVATE_KEY from the environment via vm.envUint in Deploy.s.sol.
forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast >&2

ARTIFACT="$(ls -t "$ROOT"/contracts/broadcast/Deploy.s.sol/*/run-latest.json 2>/dev/null | head -1)"
if [ -z "$ARTIFACT" ]; then
  echo "[deploy-market] could not find the broadcast artifact; deploy may have failed" >&2
  exit 1
fi

ADDRESS="$(node -e "const run=require('$ARTIFACT'); const tx=(run.transactions||[]).find(entry=>entry.contractAddress); process.stdout.write(tx?tx.contractAddress:'')")"
if [ -z "$ADDRESS" ]; then
  echo "[deploy-market] no contract address in $ARTIFACT" >&2
  exit 1
fi

# Wire the address into .env (for the CLI packages) ...
if grep -q '^DRAGNET_MARKET=' "$ENV_FILE"; then
  perl -0pi -e "s/^DRAGNET_MARKET=.*/DRAGNET_MARKET=$ADDRESS/m" "$ENV_FILE"
else
  printf 'DRAGNET_MARKET=%s\n' "$ADDRESS" >> "$ENV_FILE"
fi

# ... and into apps/web/.env.local (gitignored) so a local web build reads live.
WEB_ENV="$ROOT/apps/web/.env.local"
cat > "$WEB_ENV" <<EOF
# Local live config for the web app (gitignored). Deploy writes this.
NEXT_PUBLIC_DRAGNET_MARKET=$ADDRESS
NEXT_PUBLIC_DRAGNET_CHAIN=$CHAIN_KEY
NEXT_PUBLIC_DRAGNET_RPC_URL=$RPC_URL
EOF

echo ""
echo "[deploy-market] DragnetMarket deployed at: $ADDRESS"
echo "[deploy-market] wrote DRAGNET_MARKET to .env and apps/web/.env.local"
echo ""
echo "Set this in Vercel (Project Settings -> Environment Variables), then redeploy:"
echo "  NEXT_PUBLIC_DRAGNET_MARKET = $ADDRESS"
echo "  NEXT_PUBLIC_DRAGNET_CHAIN  = $CHAIN_KEY"
