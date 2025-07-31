#!/bin/bash

# Simple test script for Go oracle client
# This script properly converts keypairs and tests the Go client

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_DIR="$PROJECT_ROOT/client"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Go client exists
if [ ! -f "$CLIENT_DIR/oracle-client" ]; then
    log_info "Building Go client..."
    cd "$CLIENT_DIR"
    go build -o oracle-client main.go
    log_success "Go client built"
fi

cd "$CLIENT_DIR"

# Function to convert Solana keypair JSON to base58 private key
convert_keypair_to_base58() {
    local keypair_file=$1
    if [ ! -f "$keypair_file" ]; then
        log_error "Keypair file not found: $keypair_file"
        return 1
    fi
    
    # Use a simple Node.js script to convert the keypair
    node -e "
    const fs = require('fs');
    const bs58 = require('bs58');
    const keypair = JSON.parse(fs.readFileSync('$keypair_file', 'utf8'));
    const privateKeyBytes = Uint8Array.from(keypair.slice(0, 32));
    console.log(bs58.encode(privateKeyBytes));
    " 2>/dev/null || {
        # Fallback: use Python if Node.js fails
        python3 -c "
import json
import base58
with open('$keypair_file', 'r') as f:
    keypair = json.load(f)
private_key_bytes = bytes(keypair[:32])
print(base58.b58encode(private_key_bytes).decode())
        " 2>/dev/null || {
            log_error "Failed to convert keypair. Please install Node.js with bs58 or Python3 with base58"
            return 1
        }
    }
}

# Get wallet private key
log_info "Converting wallet keypair..."
WALLET_PRIVATE_KEY=$(convert_keypair_to_base58 ~/.config/solana/id.json)
if [ -z "$WALLET_PRIVATE_KEY" ]; then
    log_error "Failed to get wallet private key"
    exit 1
fi

# Get test node private keys
log_info "Converting test node keypairs..."
NODE1_PRIVATE_KEY=$(convert_keypair_to_base58 "../test-keys/node1.json")
NODE2_PRIVATE_KEY=$(convert_keypair_to_base58 "../test-keys/node2.json")

if [ -z "$NODE1_PRIVATE_KEY" ] || [ -z "$NODE2_PRIVATE_KEY" ]; then
    log_error "Failed to get test node private keys"
    log_info "Make sure test nodes are set up by running: ./scripts/setup-local-env.sh"
    exit 1
fi

log_info "Keys converted successfully"
echo

# Test the Go client
log_info "=== Testing Go Oracle Client ==="
echo

log_info "1. Testing keypair generation..."
./oracle-client generate-keypair
echo

log_info "2. Testing public feed publication..."
echo "Command: ./oracle-client publish \"BTC-USD-PUBLIC\" \"50000\" \"<node1-key>\" \"<wallet-key>\""
./oracle-client publish "BTC-USD-PUBLIC" "50000" "$NODE1_PRIVATE_KEY" "$WALLET_PRIVATE_KEY"
echo

log_info "3. Testing personal feed publication (node 1)..."
echo "Command: ./oracle-client publish \"BTC-USD-PERSONAL\" \"50100\" \"<node1-key>\" \"<wallet-key>\""
./oracle-client publish "BTC-USD-PERSONAL" "50100" "$NODE1_PRIVATE_KEY" "$WALLET_PRIVATE_KEY"
echo

log_info "4. Testing personal feed publication (node 2)..."
echo "Command: ./oracle-client publish \"BTC-USD-PERSONAL\" \"50200\" \"<node2-key>\" \"<wallet-key>\""
./oracle-client publish "BTC-USD-PERSONAL" "50200" "$NODE2_PRIVATE_KEY" "$WALLET_PRIVATE_KEY"
echo

log_success "🎉 All Go client tests completed successfully!"
echo

log_info "=== Additional Information ==="
echo "• Validator logs: tail -f /tmp/solana-validator.log"
echo "• Monitor system: ./monitor-oracle.sh"
echo "• Check accounts with: solana account <address>"
echo "• Stop validator: pkill -f solana-test-validator" 