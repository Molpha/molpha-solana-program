use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct ProtocolConfig {
    pub authority: Pubkey,
    pub fee_per_update: u64,
    pub bump: u8,
}

impl ProtocolConfig {
    pub const SEED_PREFIX: &'static [u8] = b"config";
    pub const SPACE: usize = 8 + 32 + 8 + 1;
}
