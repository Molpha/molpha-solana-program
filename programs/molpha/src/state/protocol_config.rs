use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct ProtocolConfig {
    pub authority: Pubkey,
    
    // EVM-style pricing parameters (from PricingHelper.sol)
    pub base_price_per_second_scaled: u64,  // Base price per second * SCALAR
    pub frequency_coefficient: u64,          // Coefficient for frequency scaling (basis points)
    pub signers_coefficient: u64,           // Coefficient for signers scaling (basis points)
    pub reward_percentage: u64,             // Reward percentage in basis points
    
    // Solana-specific priority fee handling
    pub priority_fee_buffer_percentage: u16, // Buffer for priority fees (e.g., 150 = 50% buffer)
    pub max_priority_fee_coverage: u64,      // Maximum priority fee to cover per transaction
    pub priority_fee_smoothing_window: u8,   // Number of recent transactions to average
    pub bump: u8,
}

impl ProtocolConfig {
    pub const SEED_PREFIX: &'static [u8] = b"config";
    pub const SPACE: usize = 8 + 32 + 8 + 8 + 8 + 8 + 2 + 8 + 1 + 8 + 1;
    pub const SCALAR: u64 = 1_000_000; // Same as EVM version
}
