#!/bin/bash
# E2E Test Scripts for V4 Cadence on Testnet
# Tests reading market data, order books, and balances

set -e

echo "=========================================="
echo "V4 TESTNET E2E TESTS - SCRIPTS"
echo "=========================================="
echo ""

NETWORK="testnet"
TESTNET_ACCOUNT="0x3ea7ac2bcdd8bcef"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

test_script() {
    local name=$1
    local script=$2
    local args=$3
    
    echo -e "${YELLOW}Testing:${NC} $name"
    echo "Script: $script"
    echo "Args: $args"
    
    if [ -z "$args" ]; then
        result=$(flow scripts execute "$script" --network "$NETWORK" 2>&1)
    else
        result=$(flow scripts execute "$script" --args-json "$args" --network "$NETWORK" 2>&1)
    fi
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ PASSED${NC}"
        echo "Result: $result"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAILED${NC}"
        echo "Error: $result"
        ((FAILED++))
    fi
    echo ""
}

echo "=== TEST 1: Get Market by ID ==="
test_script \
    "getMarketV4 (ID=1)" \
    "./contracts/cadence/scripts/getMarketV4.cdc" \
    '[{"type":"UInt64","value":"1"}]'

echo "=== TEST 2: Get Order Book ==="
test_script \
    "getOrderBookV4 (marketId=1, outcomeIndex=0)" \
    "./contracts/cadence/scripts/getOrderBookV4.cdc" \
    '[{"type":"UInt64","value":"1"},{"type":"Int","value":"0"}]'

echo "=== TEST 3: Get User Outcome Balances ==="
test_script \
    "getUserOutcomeBalancesV4 (user=$TESTNET_ACCOUNT, marketId=1)" \
    "./contracts/cadence/scripts/getUserOutcomeBalancesV4.cdc" \
    "[{\"type\":\"Address\",\"value\":\"$TESTNET_ACCOUNT\"},{\"type\":\"UInt64\",\"value\":\"1\"}]"

echo "=== TEST 4: Get Effective Prices ==="
test_script \
    "getEffectivePricesV4 (marketId=1)" \
    "./contracts/cadence/scripts/getEffectivePricesV4.cdc" \
    '[{"type":"UInt64","value":"1"}]'

echo "=== TEST 5: Get Sealed Bet ==="
test_script \
    "getSealedBetV4 (betId=1)" \
    "./contracts/cadence/scripts/getSealedBetV4.cdc" \
    '[{"type":"UInt64","value":"1"}]'

echo ""
echo "=========================================="
echo "TEST SUMMARY"
echo "=========================================="
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo "Total: $((PASSED + FAILED))"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
    exit 0
else
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    exit 1
fi
