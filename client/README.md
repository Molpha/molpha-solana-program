# Molpha Oracle Go Client

This is a Go client for the Molpha Oracle protocol on Solana. It can sign messages with Ed25519 signatures and publish oracle data to feeds.

## Features

- Generate Ed25519 keypairs for oracle nodes
- Sign messages with Ed25519 signatures
- Create Ed25519 verification instructions for Solana
- Publish oracle answers to feeds via the `verify_signatures` instruction

## Prerequisites

- Go 1.21 or later
- A running Solana validator (local or devnet/mainnet)
- Deployed Molpha Oracle programs

## Installation

```bash
cd client
go mod tidy
go build -o oracle-client main.go
```

## Usage

### Generate a new keypair

```bash
./oracle-client generate-keypair
```

This will output:
```
Private Key: <base58-encoded-private-key>
Public Key: <base58-encoded-public-key>
```

### Publish oracle data

```bash
./oracle-client publish <feed_id> <value> <node_private_key> <payer_private_key> [feed_authority_key]
```

Parameters:
- `feed_id`: The ID of the feed to publish to
- `value`: The oracle value (as string or base58-encoded bytes)
- `node_private_key`: Base58-encoded private key of the oracle node (must be registered in NodeRegistry)
- `payer_private_key`: Base58-encoded private key of the transaction payer
- `feed_authority_key`: (Optional) Base58-encoded private key or public key of the feed authority. Defaults to payer key.

Example:
```bash
./oracle-client publish "BTC-USD" "50000" "your-node-private-key" "your-payer-private-key"
```

## How it works

1. **Message Creation**: The client creates a JSON message containing the feed ID, value, and timestamp
2. **Signing**: The message is signed using Ed25519 with the node's private key
3. **Ed25519 Instruction**: An Ed25519 signature verification instruction is created with the proper format
4. **Verify Signatures Instruction**: A call to the `verify_signatures` instruction is created with all required accounts
5. **Transaction**: Both instructions are combined into a single transaction and sent to Solana

## Message Format

The client signs messages in this JSON format:
```json
{
  "feed_id": "BTC-USD",
  "value": "base58-encoded-value",
  "timestamp": 1234567890
}
```

## Program Integration

The client works with these Solana programs:
- **Node Registry Program**: Manages oracle nodes and verifies signatures
- **Feed Program**: Manages oracle feeds and stores answers

Make sure to update the program IDs in `main.go` to match your deployed programs:
```go
var (
    NodeRegistryProgramID = solana.MustPublicKeyFromBase58("your-node-registry-program-id")
    FeedProgramID         = solana.MustPublicKeyFromBase58("your-feed-program-id")
)
```

## Configuration

The client currently connects to `http://127.0.0.1:8899` (local Solana validator). To use a different RPC endpoint, modify the `NewOracleClient` call in the `publish` command section.

## Error Handling

The client includes comprehensive error handling for:
- Invalid private keys
- Network connection issues
- Transaction failures
- Signature verification failures
- Account not found errors

## Security Notes

- Keep your private keys secure and never commit them to version control
- The node private key must be registered in the NodeRegistry before it can publish data
- Ensure the payer account has sufficient SOL for transaction fees
- For personal feeds, ensure the subscription account has sufficient balance 