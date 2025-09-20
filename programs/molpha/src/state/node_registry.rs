use anchor_lang::prelude::*;

pub const MAX_NODES: usize = 256;

#[account]
#[derive(Default, InitSpace)]
pub struct NodeRegistry {
    pub authority: Pubkey,
    #[max_len(MAX_NODES)]
    pub nodes: Vec<Pubkey>,
}

impl NodeRegistry {
    pub const SEED_PREFIX: &'static [u8] = b"node-registry";
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}
