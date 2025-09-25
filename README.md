# Molpha Oracle Solana Program

This repository contains the Molpha Oracle Solana program, a unified implementation that combines node registry management and feed management functionality.

## Overview

The Molpha program provides:

### Node Registry Management
- Initialize node registry
- Add/remove oracle nodes
- Signature verification from registered nodes

### Feed Management  
- Create public and personal data feeds
- Update feed configurations (personal feeds only)
- Initialize protocol configuration
- Subscription management for personal feeds
- Balance top-up for subscriptions
- Publish oracle answers with signature verification

## Program Structure

```
programs/molpha/
├── src/
│   ├── instructions/          # All instruction handlers
│   │   ├── initialize.rs      # Initialize node registry
│   │   ├── manage_node.rs     # Add/remove nodes
│   │   ├── verify_signatures.rs # Verify signatures and publish answers
│   │   ├── create_feed.rs     # Create data feeds
│   │   ├── update_feed_config.rs # Update feed settings
│   │   ├── publish_answer.rs  # Publish oracle data
│   │   ├── initialize_protocol.rs # Initialize protocol config
│   │   ├── subscribe.rs       # Create subscriptions
│   │   └── top_up.rs         # Top up subscription balance
│   ├── state/                 # Account state definitions
│   │   ├── node_registry.rs   # Node registry state
│   │   ├── feed_account.rs    # Feed state
│   │   ├── protocol_config.rs # Protocol configuration
│   │   └── subscription_account.rs # Subscription state
│   ├── error.rs              # Error definitions
│   ├── utils.rs              # Utility functions
│   └── lib.rs                # Program entry point
└── Cargo.toml
```

## Building

```bash
anchor build
```

## Testing

```bash
anchor test
```

## Program ID

The program uses the ID: `GRguUVXULUZzYdhWBSmWVhkKNnL3zRAXagiK3XfTnAbu`