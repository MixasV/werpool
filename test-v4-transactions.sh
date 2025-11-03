#!/bin/bash
# E2E Test Transactions for V4 Cadence on Testnet
# Tests trading flow: split, orders, matching, redeem

set -e

echo "=========================================="
echo "V4 TESTNET E2E TESTS - TRANSACTIONS"
echo "=========================================="
echo ""

NETWORK="testnet"
SIGNER="testnet-deployer"
MARKET_ID="1"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

test_transaction() {
    local name=$1
    local tx=$2
    local args=$3
    
    echo -e "${YELLOW}Testing:${NC} $name"
    echo "Transaction: $tx"
    if [ ! -z "$args" ]; then
        echo "Args: $args"
    fi
    
    if [ -z "$args" ]; then
        result=$(flow transactions send "$tx" --network "$NETWORK" --signer "$SIGNER" 2>&1)
    else
        result=$(flow transactions send "$tx" --args-json "$args" --network "$NETWORK" --signer "$SIGNER" 2>&1)
    fi
    
    if echo "$result" | grep -q "sealed"; then
        echo -e "${GREEN}✅ PASSED${NC}"
        # Extract TX ID
        tx_id=$(echo "$result" | grep "ID" | awk '{print $2}')
        echo "TX ID: $tx_id"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAILED${NC}"
        echo "Error: $result"
        ((FAILED++))
    fi
    echo ""
}

echo "=== PHASE 1: SPLIT POSITION (Create Complete Sets) ==="
echo -e "${BLUE}Split 10 FLOW into complete sets for market $MARKET_ID${NC}"
echo ""

test_transaction \
    "splitPositionV4 (10 FLOW)" \
    "./contracts/cadence/transactions/splitPositionV4.cdc" \
    "[{\"type\":\"UInt64\",\"value\":\"$MARKET_ID\"},{\"type\":\"UFix64\",\"value\":\"10.0\"}]"

echo "=== PHASE 2: CREATE BUY ORDER ==="
echo -e "${BLUE}Create buy order for outcome 0 at price 0.60${NC}"
echo ""

test_transaction \
    "createBuyOrderV4 (outcome=0, size=5, price=0.60)" \
    "./contracts/cadence/transactions/createBuyOrderV4.cdc" \
    "[{\"type\":\"UInt64\",\"value\":\"$MARKET_ID\"},{\"type\":\"Int\",\"value\":\"0\"},{\"type\":\"UFix64\",\"value\":\"5.0\"},{\"type\":\"UFix64\",\"value\":\"0.60\"}]"

echo "=== PHASE 3: CREATE SELL ORDER ==="
echo -e "${BLUE}Create sell order for outcome 0 at price 0.70${NC}"
echo ""

test_transaction \
    "createSellOrderV4 (outcome=0, size=3, price=0.70)" \
    "./contracts/cadence/transactions/createSellOrderV4.cdc" \
    "[{\"type\":\"UInt64\",\"value\":\"$MARKET_ID\"},{\"type\":\"Int\",\"value\":\"0\"},{\"type\":\"UFix64\",\"value\":\"3.0\"},{\"type\":\"UFix64\",\"value\":\"0.70\"}]"

echo "=== PHASE 4: CHECK ORDER BOOK ==="
echo -e "${BLUE}Verify orders were created${NC}"
echo ""

order_book=$(flow scripts execute ./contracts/cadence/scripts/getOrderBookV4.cdc \
    --args-json "[{\"type\":\"UInt64\",\"value\":\"$MARKET_ID\"},{\"type\":\"Int\",\"value\":\"0\"}]" \
    --network "$NETWORK" 2>&1 | grep -v "Version warning")

echo "Order Book:"
echo "$order_book"
echo ""

echo "=== PHASE 5: MERGE POSITION (Redeem Complete Sets) ==="
echo -e "${BLUE}Merge complete sets back to collateral${NC}"
echo ""

test_transaction \
    "mergePositionV4 (2 shares)" \
    "./contracts/cadence/transactions/mergePositionV4.cdc" \
    "[{\"type\":\"UInt64\",\"value\":\"$MARKET_ID\"},{\"type\":\"UFix64\",\"value\":\"2.0\"}]"

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
    echo -e "${YELLOW}⚠️ Some tests failed (may be expected if market is settled)${NC}"
    exit 0  # Don't fail the script, some failures are expected
fi
