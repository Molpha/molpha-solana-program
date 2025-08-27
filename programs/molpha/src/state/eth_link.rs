use anchor_lang::prelude::*;

/// EthLink account for authorizing Solana grantees to use Ethereum-owned data sources
#[account]
pub struct EthLink {
    /// The Ethereum address that owns the data sources
    pub owner_eth: [u8; 20],
    /// The Solana public key that is granted access (as bytes32)
    pub grantee: [u8; 32],
    /// When this link was created
    pub created_at: i64,
    /// Bump seed for the PDA
    pub bump: u8,
}

impl EthLink {
    pub const SEED_PREFIX: &'static [u8] = b"eth_link";
    pub const SPACE: usize = 8 + // discriminator
        20 + // owner_eth
        32 + // grantee
        8 +  // created_at
        1; // bump

    /// Get the PDA seeds for this account
    pub fn get_seeds<'a>(owner_eth: &'a [u8; 20], grantee: &'a [u8; 32]) -> [&'a [u8]; 3] {
        [Self::SEED_PREFIX, owner_eth, grantee]
    }
}
