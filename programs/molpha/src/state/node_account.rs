use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct NodeAccount {
    pub authority: Pubkey,        // Who can manage this node
    pub node_pubkey: Pubkey,      // The actual node's public key
    pub is_active: bool,          // Whether the node is active
    pub created_at: i64,          // When the node was created
    pub last_active: i64,         // Last time the node was active
}

impl NodeAccount {
    pub const SEED_PREFIX: &'static [u8] = b"node";
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 8 + 8;
}
