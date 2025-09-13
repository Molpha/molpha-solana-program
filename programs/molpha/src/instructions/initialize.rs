use crate::events::{NodeRegistryInitialized, ProtocolInitialized};
use crate::state::{NodeRegistry, ProtocolConfig};
use anchor_lang::prelude::*;

pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let clock = Clock::get()?;
    
    // Initialize NodeRegistry
    let node_registry = &mut ctx.accounts.node_registry;
    node_registry.authority = ctx.accounts.authority.key();
    node_registry.nodes = Vec::new();

    // Initialize ProtocolConfig
    let protocol_config = &mut ctx.accounts.protocol_config;
    protocol_config.authority = ctx.accounts.authority.key();
    protocol_config.bump = ctx.bumps.protocol_config;

    // Emit events
    emit!(NodeRegistryInitialized {
        node_registry: ctx.accounts.node_registry.key(),
        authority: ctx.accounts.authority.key(),
        initialized_at: clock.unix_timestamp,
    });

    emit!(ProtocolInitialized {
        protocol_config: ctx.accounts.protocol_config.key(),
        authority: ctx.accounts.authority.key(),
        initialized_at: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = NodeRegistry::SPACE,
        seeds = [NodeRegistry::SEED_PREFIX],
        bump
    )]
    pub node_registry: Account<'info, NodeRegistry>,
    
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
