use crate::events::ProtocolInitialized;
use crate::state::ProtocolConfig;
use anchor_lang::prelude::*;

pub fn initialize_protocol(ctx: Context<InitializeProtocol>, fee: u64) -> Result<()> {
    let config = &mut ctx.accounts.protocol_config;
    config.authority = ctx.accounts.authority.key();
    config.fee_per_update = fee;
    config.bump = ctx.bumps.protocol_config;

    // Emit event
    emit!(ProtocolInitialized {
        protocol_config: ctx.accounts.protocol_config.key(),
        authority: ctx.accounts.authority.key(),
        base_fee: fee,
        fee_multiplier: 1, // Default multiplier
        initialized_at: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(
        init,
        payer = authority,
        space = ProtocolConfig::SPACE,
        seeds = [ProtocolConfig::SEED_PREFIX],
        bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}
