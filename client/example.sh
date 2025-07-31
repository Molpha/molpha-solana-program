#!/bin/bash

# Example script for using the Molpha Oracle Go Client
# Make sure you have:
# 1. Built the client: go build -o oracle-client main.go
# 2. A running Solana validator
# 3. Deployed the oracle programs
# 4. Registered your node in the NodeRegistry
# 5. Created a feed and subscription (if needed)

set -e

echo "=== Molpha Oracle Client Example ==="
echo

# Build the client if it doesn't exist
if [ ! -f "./oracle-client" ]; then
    echo "Building oracle client..."
    go build -o oracle-client main.go
    echo "✓ Client built successfully"
    echo
fi

# Generate a new keypair for demonstration
echo "1. Generating a new keypair..."
./oracle-client generate-keypair > keypair.txt
echo "✓ Keypair generated and saved to keypair.txt"
echo

# Extract the keys (you would normally save these securely)
PRIVATE_KEY=$(grep "Private Key:" keypair.txt | cut -d' ' -f3)
PUBLIC_KEY=$(grep "Public Key:" keypair.txt | cut -d' ' -f3)

echo "Generated keys:"
echo "Private Key: $PRIVATE_KEY"
echo "Public Key: $PUBLIC_KEY"
echo

# Note: In a real scenario, you would:
# 1. Register this public key in the NodeRegistry using your authority
# 2. Create a feed if it doesn't exist
# 3. Create a subscription if using a personal feed
# 4. Ensure the payer has sufficient SOL

echo "2. Example oracle data publication..."
echo "Note: This will fail unless the node is registered and feed exists"
echo

# Example values
FEED_ID="BTC-USD-TEST"
VALUE="50000"
PAYER_KEY="$PRIVATE_KEY"  # Using same key as payer for simplicity

echo "Publishing oracle data:"
echo "Feed ID: $FEED_ID"
echo "Value: $VALUE"
echo "Node Key: $PUBLIC_KEY"
echo

# This would publish the data (will likely fail in demo without proper setup)
echo "Running: ./oracle-client publish \"$FEED_ID\" \"$VALUE\" \"$PRIVATE_KEY\" \"$PAYER_KEY\""
echo

# Uncomment the next line to actually try publishing (will likely fail without proper setup)
# ./oracle-client publish "$FEED_ID" "$VALUE" "$PRIVATE_KEY" "$PAYER_KEY"

echo "=== Setup Required ==="
echo "To actually publish data, you need to:"
echo "1. Have a running Solana validator"
echo "2. Deploy the oracle programs"
echo "3. Initialize the NodeRegistry and ProtocolConfig"
echo "4. Add the node public key to the NodeRegistry:"
echo "   anchor run add-node -- $PUBLIC_KEY"
echo "5. Create a feed:"
echo "   anchor run create-feed -- \"$FEED_ID\""
echo "6. If using a personal feed, create and fund a subscription"
echo "7. Ensure the payer account has sufficient SOL for fees"
echo

echo "=== Example with Multiple Nodes ==="
echo "For multi-signature validation, you would:"
echo "1. Generate multiple keypairs"
echo "2. Register all nodes in the NodeRegistry"
echo "3. Have each node sign the same message"
echo "4. Include all Ed25519 verification instructions in the same transaction"
echo "5. Call verify_signatures with min_signatures_threshold > 1"
echo

# Clean up
rm -f keypair.txt

echo "✓ Example completed" 