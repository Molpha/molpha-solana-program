use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct FaucetConfig {
    /// Authority that can manage the faucet
    pub authority: Pubkey,
    /// The SPL token mint that this faucet manages and mints from
    pub token_mint: Pubkey,
    /// Amount of tokens to distribute per request (in token's smallest unit)
    pub amount_per_request: u64,
    /// Cooldown period in seconds between requests from the same user
    pub cooldown_seconds: u64,
    /// Whether the faucet is currently active
    pub is_active: bool,
    /// Token decimals for minting
    pub token_decimals: u8,
    /// Bump seed for the PDA
    pub bump: u8,
}

impl FaucetConfig {
    pub const SEED_PREFIX: &'static [u8] = b"faucet_config";
    // 8 (discriminator) + 32 (authority) + 32 (token_mint) + 8 (amount) + 8 (cooldown) + 1 (is_active) + 1 (decimals) + 1 (bump)
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}

#[account]
#[derive(InitSpace)]
pub struct UserCooldown {
    /// The user's public key
    pub user: Pubkey,
    /// Last request timestamp
    pub last_request: i64,
    /// Bump seed for the PDA
    pub bump: u8,
}

impl UserCooldown {
    pub const SEED_PREFIX: &'static [u8] = b"user_cooldown";
    // 8 (discriminator) + 32 (user) + 8 (last_request) + 1 (bump)
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}
