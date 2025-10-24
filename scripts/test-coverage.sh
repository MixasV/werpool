#!/bin/bash

# Test coverage script
# Runs tests with coverage reporting

set -e

echo "🧪 Running tests with coverage..."

cd "$(dirname "$0")/.."

# Run API tests
echo "Testing API..."
cd apps/api
pnpm test --coverage --coverageDirectory=../../coverage/api

# Generate coverage report
echo "📊 Coverage Summary:"
echo "===================="
cat ../../coverage/api/coverage-summary.json | grep -A 4 "total"

echo ""
echo "✅ Tests complete! Coverage report: coverage/api/lcov-report/index.html"
