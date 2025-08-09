use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct SubscriptionAccount {
    pub owner: Pubkey,
    pub balance: u64,
    pub parent_subscription: Option<Pubkey>,
    pub bump: u8,
}

impl SubscriptionAccount {
    pub const SEED_PREFIX: &'static [u8] = b"subscription";
    pub const SPACE: usize = 8 + 32 + 8 + (1 + 32) + 1;
}
