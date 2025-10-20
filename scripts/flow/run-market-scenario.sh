#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/../.. && pwd)"
FLOW_BIN="${FLOW_BIN:-flow}"
FLOW_JSON="${FLOW_CONFIG:-$ROOT_DIR/flow.json}"
TEST_FILE="${FLOW_TEST_FILE:-$ROOT_DIR/contracts/cadence/tests/core_market_hub_test.cdc}"
TEST_FILTER="${FLOW_TEST_FILTER:-testTradeSettleClaimScenario}"

echo "[cadence:scenario] bootstrap" >&2

ensure_flow_cli() {
  local kernel
  kernel="$(uname -s 2>/dev/null || echo unknown)"

  if [[ "$kernel" == MINGW* || "$kernel" == CYGWIN* ]]; then
    echo "Windows окружение обнаружено. Пропускаем запуск сценария (используйте Linux/macOS или Docker)."
    exit 0
  fi

  if command -v "$FLOW_BIN" >/dev/null 2>&1; then
    return 0
  fi

  if command -v flow >/dev/null 2>&1; then
    FLOW_BIN="flow"
    return 0
  fi

  if command -v docker >/dev/null 2>&1; then
    FLOW_BIN="docker"
    return 0
  fi

  return 1
}

if ! ensure_flow_cli; then
  echo "Flow CLI не найден и Docker недоступен. Пропускаем сценарий (установите Flow CLI для локального запуска)." >&2
  exit 0
fi

cd "$ROOT_DIR"

echo "Running Flow test scenario: file=$TEST_FILE filter=$TEST_FILTER"

if [ "$FLOW_BIN" = "docker" ]; then
  docker run --rm \
    -v "$ROOT_DIR":/workspace \
    -w /workspace \
    ghcr.io/onflow/flow-cli:latest \
    test "$TEST_FILE" --config "$FLOW_JSON" --filter "$TEST_FILTER"
else
  "$FLOW_BIN" test "$TEST_FILE" \
    --config "$FLOW_JSON" \
    --filter "$TEST_FILTER"
fi
