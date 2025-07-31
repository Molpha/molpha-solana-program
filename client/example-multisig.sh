#!/bin/bash

# Multi-signature Oracle Client Example
# This script demonstrates how to use the updated oracle client with multiple node signatures

set -e

echo "=== Multi-Signature Oracle Client Demo ==="

# Build the client
echo "Building the oracle client..."
go build -o oracle-client main.go

# Generate keypairs for demonstration
echo "Generating keypairs for demo..."

echo "Generating Node 1 keypair..."
NODE1_OUTPUT=$(./oracle-client generate-keypair)
NODE1_PRIVATE=$(echo "$NODE1_OUTPUT" | grep "Private Key:" | cut -d' ' -f3)
NODE1_PUBLIC=$(echo "$NODE1_OUTPUT" | grep "Public Key:" | cut -d' ' -f3)

echo "Generating Node 2 keypair..."
NODE2_OUTPUT=$(./oracle-client generate-keypair)
NODE2_PRIVATE=$(echo "$NODE2_OUTPUT" | grep "Private Key:" | cut -d' ' -f3)
NODE2_PUBLIC=$(echo "$NODE2_OUTPUT" | grep "Public Key:" | cut -d' ' -f3)

echo "Generating Node 3 keypair..."
NODE3_OUTPUT=$(./oracle-client generate-keypair)
NODE3_PRIVATE=$(echo "$NODE3_OUTPUT" | grep "Private Key:" | cut -d' ' -f3)
NODE3_PUBLIC=$(echo "$NODE3_OUTPUT" | grep "Public Key:" | cut -d' ' -f3)

echo "Generating Payer keypair..."
PAYER_OUTPUT=$(./oracle-client generate-keypair)
PAYER_PRIVATE=$(echo "$PAYER_OUTPUT" | grep "Private Key:" | cut -d' ' -f3)
PAYER_PUBLIC=$(echo "$PAYER_OUTPUT" | grep "Public Key:" | cut -d' ' -f3)

echo ""
echo "Generated Keypairs:"
echo "Node 1 Public Key: $NODE1_PUBLIC"
echo "Node 2 Public Key: $NODE2_PUBLIC"
echo "Node 3 Public Key: $NODE3_PUBLIC"
echo "Payer Public Key:  $PAYER_PUBLIC"
echo ""

# Example 1: Single node signature (backwards compatibility)
echo "=== Example 1: Single Node Signature ==="
echo "Publishing with single node signature..."
./oracle-client publish "price-feed-1" "12345" "$NODE1_PRIVATE" "$PAYER_PRIVATE"
echo ""

# Example 2: Two node signatures
echo "=== Example 2: Two Node Signatures ==="
echo "Publishing with two node signatures..."
./oracle-client publish "price-feed-2" "23456" "$NODE1_PRIVATE,$NODE2_PRIVATE" "$PAYER_PRIVATE"
echo ""

# Example 3: Three node signatures
echo "=== Example 3: Three Node Signatures ==="
echo "Publishing with three node signatures..."
./oracle-client publish "price-feed-3" "34567" "$NODE1_PRIVATE,$NODE2_PRIVATE,$NODE3_PRIVATE" "$PAYER_PRIVATE"
echo ""

# Example 4: Using environment variable to set minimum signatures (2 out of 3)
echo "=== Example 4: Flexible Signature Requirements (2 out of 3) ==="
echo "Publishing with 3 nodes but requiring only 2 signatures..."
export MIN_SIGNATURES=2
./oracle-client publish "price-feed-4" "45678" "$NODE1_PRIVATE,$NODE2_PRIVATE,$NODE3_PRIVATE" "$PAYER_PRIVATE"
unset MIN_SIGNATURES
echo ""

echo "=== Demo Complete ==="
echo "The oracle client now supports:"
echo "1. Single node signatures (backwards compatible)"
echo "2. Multiple node signatures for enhanced security"
echo "3. Flexible minimum signature requirements"
echo "4. Comma-separated node key input" 