# Oracle Client

A Go client for interacting with the Molpha Solana Oracle program, supporting both single and multi-signature oracle data publishing.

## Features

- **Multi-signature Support**: Publish oracle data with multiple oracle nodes signing the same message
- **Flexible Signature Requirements**: Configure minimum signature thresholds (e.g., 2-of-3, 3-of-5)
- **Backwards Compatibility**: Still supports single-node operation
- **Ed25519 Signature Verification**: Uses Solana's native Ed25519 program for signature verification
- **Keypair Generation**: Generate new Ed25519 keypairs for oracle nodes

## Installation

```bash
go build -o oracle-client main.go
```

## Usage

### Generate Keypairs

Generate a new Ed25519 keypair for oracle nodes:

```bash
./oracle-client generate-keypair
```

### Publish Oracle Data

#### Single Node Signature (Backwards Compatible)

```bash
./oracle-client publish <feed_id> <value> <node_private_key> <payer_private_key> [feed_authority_key]
```

Example:
```bash
./oracle-client publish "ETH-PRICE" "3500" "4jK8...node_key" "3hF2...payer_key"
```

#### Multiple Node Signatures

For enhanced security, use multiple oracle nodes to sign the same data:

```bash
./oracle-client publish <feed_id> <value> <node_key1,node_key2,node_key3> <payer_private_key> [feed_authority_key]
```

Example with 3 nodes:
```bash
./oracle-client publish "ETH-PRICE" "3500" "4jK8...node1,5mL9...node2,6nM0...node3" "3hF2...payer_key"
```

#### Flexible Signature Requirements

By default, all provided nodes must sign. You can override this using the `MIN_SIGNATURES` environment variable:

```bash
# Require only 2 signatures out of 3 nodes
export MIN_SIGNATURES=2
./oracle-client publish "ETH-PRICE" "3500" "node1,node2,node3" "payer_key"
```

## How Multi-Signature Works

1. **Message Creation**: The client creates a JSON message containing feed_id, value, and timestamp
2. **Multiple Signatures**: Each oracle node signs the same message with their private key
3. **Ed25519 Instructions**: Multiple Ed25519 verification instructions are created, one per node
4. **Transaction Assembly**: All Ed25519 instructions are included before the `verify_signatures` instruction
5. **On-Chain Verification**: The Rust program iterates through Ed25519 instructions, validates signatures, and ensures the minimum threshold is met

## Examples

Run the comprehensive demo script:

```bash
./example-multisig.sh
```

This script demonstrates:
- Single node signature (backwards compatibility)
- Two node signatures
- Three node signatures  
- Flexible signature requirements (2-of-3)

## Security Benefits

Multi-signature oracle data provides several security advantages:

1. **Decentralization**: No single point of failure
2. **Collusion Resistance**: Requires multiple nodes to coordinate malicious behavior
3. **Data Integrity**: Multiple independent sources validate the same data
4. **Threshold Security**: Configurable N-of-M signature schemes

## Integration with Solana Programs

The client works with the Molpha Oracle infrastructure:

- **Node Registry Program**: Manages registered oracle nodes
- **Feed Program**: Handles oracle data publishing and consumption
- **Ed25519 Program**: Native Solana program for signature verification

## Error Handling

Common error scenarios:

- **Insufficient Nodes**: Client validates you have enough nodes for the minimum signature requirement
- **Invalid Keys**: Proper validation of private key formats
- **Network Issues**: Retry logic for transaction confirmation
- **Signature Verification**: On-chain validation ensures all signatures are valid

## Development

### Building

```bash
go build -o oracle-client main.go
```

### Testing

```bash
# Test with local validator
./oracle-client publish "test-feed" "12345" "node1,node2" "payer_key"
```

## Environment Variables

- `MIN_SIGNATURES`: Override the default requirement of all nodes signing (useful for testing)

## Command Line Reference

```
Usage:
  generate-keypair                                                    - Generate a new keypair
  publish <feed_id> <value> <node_key1[,node_key2,...]> <payer_key> [authority_key] - Publish oracle data with multiple signatures

Examples:
  Single node:    publish feed1 hello node_key payer_key
  Multiple nodes: publish feed1 hello node_key1,node_key2,node_key3 payer_key
``` 