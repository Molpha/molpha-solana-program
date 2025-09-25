# Anchor Scripts Documentation

This directory contains executable JavaScript scripts for interacting with the Molpha Solana programs. These scripts have been extracted from `Anchor.toml` for better maintainability and version control.

## Prerequisites

- Node.js installed
- Anchor CLI installed and configured
- Solana CLI with a configured wallet
- Programs deployed to the target cluster

## Available Scripts

> **Important**: When using `anchor run` with script arguments, you must use `--` to separate the script name from its arguments. For example: `anchor run create-feed -- "ETH/USD" public 3 30`

### 1. `initialize.js`
Initializes the NodeRegistry for the MolphaSolana program.

**Usage:**
```bash
# Via Anchor
anchor run initialize

# Direct execution
node scripts/initialize.js
```

**What it does:**
- Creates and initializes the NodeRegistry PDA
- Sets the authority to the wallet public key
- Initializes with an empty nodes array

---

### 2. `initialize-protocol.js`
Initializes the ProtocolConfig for the MolphaFeed program.

**Usage:**
```bash
# Via Anchor (default fee: 1000 lamports)
anchor run initialize-protocol

# With custom fee
anchor run initialize-protocol -- 2000

# Direct execution
node scripts/initialize-protocol.js [FEE]
```

**Parameters:**
- `FEE` (optional): Protocol fee per update in lamports (default: 1000)

**What it does:**
- Creates and initializes the ProtocolConfig PDA
- Sets the authority to the wallet public key
- Configures the fee per update

---

### 3. `add-node.js`
Adds an oracle node to the NodeRegistry.

**Usage:**
```bash
# Via Anchor
anchor run add-node -- <NODE_PUBKEY>

# Direct execution
node scripts/add-node.js <NODE_PUBKEY>
```

**Parameters:**
- `NODE_PUBKEY` (required): Public key of the oracle node to add

**What it does:**
- Adds the specified node to the NodeRegistry
- Requires authority signature

---

### 4. `create-feed.js`
Creates a new price feed.

**Usage:**
```bash
# Via Anchor
anchor run create-feed -- <FEED_ID> [TYPE] [MIN_SIGS] [FREQUENCY] [IPFS_CID]

# Direct execution
node scripts/create-feed.js <FEED_ID> [TYPE] [MIN_SIGS] [FREQUENCY] [IPFS_CID]
```

**Parameters:**
- `FEED_ID` (required): Unique identifier for the feed
- `TYPE` (optional): "personal" or "public" (default: "public")
- `MIN_SIGS` (optional): Minimum signatures threshold (default: 1)
- `FREQUENCY` (optional): Update frequency in seconds (default: 60)
- `IPFS_CID` (optional): IPFS content identifier (default: "QmTestCid")

**Examples:**
```bash
# Create a public ETH/USD feed
anchor run create-feed -- "ETH/USD" public 3 30

# Create a personal BTC feed
anchor run create-feed -- "BTC/USD" personal 1 60 QmExampleHash
```

---

### 5. `subscribe.js`
Creates a subscription to a price feed.

**Usage:**
```bash
# Via Anchor
anchor run subscribe -- <FEED_ID> [CONSUMER_PUBKEY]

# Direct execution
node scripts/subscribe.js <FEED_ID> [CONSUMER_PUBKEY]
```

**Parameters:**
- `FEED_ID` (required): ID of the feed to subscribe to
- `CONSUMER_PUBKEY` (optional): Consumer's public key (default: wallet public key)

**What it does:**
- Creates a subscription account for the specified consumer
- Links the subscription to the feed
- Enables the consumer to receive feed updates

---

### 6. `top-up.js`
Adds funds to an existing subscription.

**Usage:**
```bash
# Via Anchor
anchor run top-up -- <FEED_ID> [CONSUMER_PUBKEY_OR_AMOUNT] [AMOUNT]

# Direct execution
node scripts/top-up.js <FEED_ID> [CONSUMER_PUBKEY_OR_AMOUNT] [AMOUNT]
```

**Parameters:**
- `FEED_ID` (required): ID of the feed subscription to top up
- `CONSUMER_PUBKEY_OR_AMOUNT` (optional): Consumer's public key OR amount in lamports
- `AMOUNT` (optional): Amount in lamports (used when CONSUMER_PUBKEY is specified)

**Examples:**
```bash
# Top up your own subscription with 5000 lamports
anchor run top-up -- "ETH/USD" 5000

# Top up another consumer's subscription
anchor run top-up -- "ETH/USD" <CONSUMER_PUBKEY> 5000
```

**What it does:**
- Adds the specified amount to the subscription balance
- Extends the subscription duration based on protocol fees

---

## Common Workflows

### Initial Setup
```bash
# 1. Deploy programs
anchor deploy

# 2. Initialize both programs
anchor run initialize
anchor run initialize-protocol

# 3. Add oracle nodes
anchor run add-node -- <NODE_1_PUBKEY>
anchor run add-node -- <NODE_2_PUBKEY>
```

### Creating and Using Feeds
```bash
# 1. Create a feed
anchor run create-feed -- "ETH/USD" public 2 30

# 2. Subscribe to the feed
anchor run subscribe -- "ETH/USD"

# 3. Top up subscription if needed (using default consumer)
anchor run top-up -- "ETH/USD" 5000
```

## Error Handling

All scripts include proper error handling and will:
- Display clear error messages
- Exit with non-zero code on failure
- Provide usage information for missing parameters
- Show transaction signatures on success

## Environment Variables

The scripts respect standard Anchor environment configuration:
- `ANCHOR_PROVIDER_URL`: RPC endpoint
- `ANCHOR_WALLET`: Wallet path
- Cluster configuration from `Anchor.toml`

## Script Structure

Each script follows a consistent pattern:
1. Shebang for direct execution (`#!/usr/bin/env node`)
2. Parameter validation with usage help
3. Anchor provider setup
4. PDA derivation
5. Transaction execution with error handling
6. Success confirmation with relevant details

## Maintenance

When modifying these scripts:
1. Maintain the parameter validation and usage help
2. Keep error messages clear and actionable
3. Include transaction signatures in output for debugging
4. Test both Anchor run and direct execution methods 