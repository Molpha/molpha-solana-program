use crate::state::NodeRegistry;
use anchor_lang::prelude::*;

pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let node_registry = &mut ctx.accounts.node_registry;
    node_registry.authority = ctx.accounts.authority.key();
    node_registry.nodes = Vec::new();
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
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}
