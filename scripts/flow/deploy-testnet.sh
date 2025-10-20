#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/../.. && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts/cadence"

FLOW_JSON="${FLOW_CONFIG:-$ROOT_DIR/flow.json}"
ACCOUNT_ALIAS="${FLOW_ACCOUNT_ALIAS:-testnet-deployer}"
NETWORK="${FLOW_NETWORK:-testnet}"
FLOW_BIN="${FLOW_BIN:-flow}"

echo "Using flow.json: $FLOW_JSON"
echo "Deploying contracts to $NETWORK as $ACCOUNT_ALIAS"

cd "$CONTRACTS_DIR"

if ! command -v "$FLOW_BIN" >/dev/null 2>&1; then
  echo "Flow CLI ($FLOW_BIN) not found in PATH" >&2
  exit 1
fi

"$FLOW_BIN" project deploy \
  --config "$FLOW_JSON" \
  --network "$NETWORK" \
  --update \
  --signer "$ACCOUNT_ALIAS"

echo "Deployment finished"
