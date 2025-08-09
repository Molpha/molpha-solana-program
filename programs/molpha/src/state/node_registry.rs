use anchor_lang::prelude::*;

pub const MAX_NODES: usize = 256;

#[account]
#[derive(Default)]
pub struct NodeRegistry {
    pub authority: Pubkey,
    pub nodes: Vec<Pubkey>,
}

impl NodeRegistry {
    pub const SEED_PREFIX: &'static [u8] = b"node-registry";
    pub const SPACE: usize = 8 + 32 + 4 + (32 * MAX_NODES);
}
