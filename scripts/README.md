# Molpha Oracle Scripts

This directory contains scripts to deploy, initialize, and configure the Molpha Oracle environment on a local Solana validator for testing the Go client.

## Quick Start

1. **Install Dependencies**
   ```bash
   ./scripts/install-deps.sh
   ```

2. **Setup Local Environment**
   ```bash
   ./scripts/setup-local-env.sh
   ```

3. **Test Go Client**
   ```bash
   ./scripts/test-go-client-simple.sh
   ```

## Scripts Overview

### `install-deps.sh`
- Checks for required tools (Go, Solana CLI, Anchor CLI)
- Installs Node.js dependencies (including bs58 for keypair conversion)
- Installs optional Python dependencies as fallback

### `setup-local-env.sh` 
**Main setup script that:**
- Starts a local Solana validator
- Configures Solana CLI for localhost
- Builds and deploys the oracle programs
- Initializes NodeRegistry and ProtocolConfig
- Generates 3 test oracle node keypairs
- Registers test nodes in the NodeRegistry
- Creates test feeds (public and personal)
- Sets up subscriptions for personal feeds
- Builds the Go oracle client
- Generates additional helper scripts

### `test-go-client-simple.sh`
**Go client testing script that:**
- Converts Solana keypairs to base58 format
- Tests keypair generation
- Tests oracle data publication to public feeds
- Tests oracle data publication to personal feeds
- Uses multiple test nodes to verify multi-signature support

### Node Management Scripts

#### `add-node.js`
**Single node management script:**
- Adds a single node to the node registry
- Includes validation and error handling
- Provides detailed feedback and verification

#### `manage-nodes.js`
**Comprehensive node management script:**
- Add single or multiple nodes
- Remove nodes from registry
- List all registered nodes with details
- Get status of specific nodes
- Generate test keypairs
- Batch operations from JSON files

#### `nodes` (Shell wrapper)
**Convenient shell wrapper for node management:**
- Provides colored output and error handling
- Easy-to-use command-line interface
- Automatically locates and runs manage-nodes.js

### Protocol Initialization and Node Management

#### Quick Start
```bash
# 1. Initialize the protocol (required first step)
./scripts/nodes init 1000

# 2. Check protocol status
./scripts/nodes check

# 3. Add nodes to the registry
./scripts/nodes add 11111111111111111111111111111112

# 4. List all registered nodes
./scripts/nodes list
```

#### Initialization Commands

```bash
# Initialize protocol with default fee (1000 lamports)
./scripts/nodes init

# Initialize protocol with custom fee
./scripts/nodes init 2000

# Check if protocol is initialized and view status
./scripts/nodes check
```

#### Node Management Commands

```bash
# Add a single node
./scripts/nodes add 11111111111111111111111111111112

# List all nodes
./scripts/nodes list

# Get node status
./scripts/nodes status 11111111111111111111111111111112

# Generate test keypairs
./scripts/nodes generate-keypairs 5

# Batch add nodes from file
./scripts/nodes batch-add sample-nodes.json

# Remove a node
./scripts/nodes remove 11111111111111111111111111111112
```

#### Environment Setup

The scripts automatically handle environment variables, but you can also set them manually:

```bash
# Set environment variables (optional)
export ANCHOR_PROVIDER_URL="http://127.0.0.1:8899"
export ANCHOR_WALLET="$HOME/.config/solana/id.json"

# Then run commands
./scripts/nodes init
```

## Generated Scripts

After running `setup-local-env.sh`, these scripts will be created in the project root:

### `test-go-client.sh`
- Alternative test script with different key conversion approach
- Generated automatically by setup script

### `monitor-oracle.sh`
- Shows system status (wallet balance, program IDs, account status)
- Lists test node public keys
- Provides monitoring commands

### `cleanup-test-env.sh`
- Stops the local validator
- Cleans up temporary files
- Optionally removes test keys

## Prerequisites

Before running the scripts, ensure you have:

- **Go 1.21+**: For building the Go client
- **Solana CLI**: For blockchain interaction
- **Anchor CLI**: For program deployment
- **Node.js**: For running Anchor scripts
- **Yarn or NPM**: For dependency management

## Environment Setup Details

The setup script creates:

1. **Local Validator**
   - Runs on `localhost:8899`
   - Ledger stored in `/tmp/solana-ledger`
   - Logs written to `/tmp/solana-validator.log`

2. **Test Keypairs**
   - Main wallet: `~/.config/solana/id.json`
   - Test nodes: `test-keys/node1.json`, `node2.json`, `node3.json`

3. **Test Feeds**
   - Public feed: `BTC-USD-PUBLIC` (min signatures: 1)
   - Personal feed: `BTC-USD-PERSONAL` (min signatures: 2)

4. **Oracle System**
   - NodeRegistry initialized with authority
   - ProtocolConfig set to 1000 lamports per update
   - 3 oracle nodes registered
   - Personal feed subscription funded with 100,000 lamports

## Usage Examples

### Manual Testing
```bash
# Generate a new keypair
./client/oracle-client generate-keypair

# Publish to public feed
./client/oracle-client publish "BTC-USD-PUBLIC" "50000" <node_private_key> <payer_private_key>

# Publish to personal feed
./client/oracle-client publish "BTC-USD-PERSONAL" "50100" <node_private_key> <payer_private_key>
```

### System Monitoring
```bash
# Check system status
./monitor-oracle.sh

# View validator logs
tail -f /tmp/solana-validator.log

# Check account balances
solana balance
solana account <address>
```

### Cleanup
```bash
# Stop validator and cleanup
./cleanup-test-env.sh
```

## Troubleshooting

### Common Issues

1. **Validator fails to start**
   - Check if port 8899 is already in use
   - Ensure sufficient disk space in `/tmp`
   - Try manually killing existing validators: `pkill -f solana-test-validator`

2. **Program deployment fails**
   - Ensure Anchor CLI is properly installed
   - Check that you have sufficient SOL for deployment
   - Try running `anchor clean` and rebuilding

3. **Go client build fails**
   - Verify Go 1.21+ is installed
   - Check that `client/go.mod` exists
   - Run `go mod tidy` in the client directory

4. **Keypair conversion fails**
   - Install bs58: `npm install bs58` or `yarn add bs58`
   - Alternative: install Python base58: `pip3 install base58 --user`

5. **Transaction failures**
   - Check validator is running: `solana cluster-version`
   - Verify account balances: `solana balance`
   - Check validator logs for error details

### Debugging Tips

- **View detailed logs**: `tail -f /tmp/solana-validator.log`
- **Check program accounts**: `solana account <program_id>`
- **Verify node registration**: Use `monitor-oracle.sh` to see registered nodes
- **Test individual components**: Use anchor commands directly (e.g., `anchor run add-node`)

## Script Architecture

The scripts follow a modular approach:

1. **Prerequisites Check**: Verify all required tools are installed
2. **Environment Setup**: Configure Solana CLI and start validator
3. **Program Deployment**: Build and deploy oracle programs
4. **System Initialization**: Initialize core accounts and configurations
5. **Test Data Setup**: Create test nodes, feeds, and subscriptions
6. **Client Preparation**: Build Go client and prepare test scripts
7. **Monitoring Tools**: Generate scripts for ongoing monitoring and cleanup

This ensures a complete, reproducible testing environment for the Molpha Oracle system. 