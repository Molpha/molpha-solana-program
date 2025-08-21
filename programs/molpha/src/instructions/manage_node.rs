use crate::error::NodeRegistryError;
use crate::state::{NodeAccount, NodeRegistry, MAX_NODES};
use anchor_lang::prelude::*;

pub fn add_node(ctx: Context<AddNode>, node_pubkey: Pubkey) -> Result<()> {
    require!(
        node_pubkey != Pubkey::default(),
        NodeRegistryError::ZeroPubkey
    );

    let node_registry = &mut ctx.accounts.node_registry;
    require!(
        node_registry.nodes.len() < MAX_NODES,
        NodeRegistryError::MaxNodesReached
    );

    // Create the node PDA account
    let node_account = &mut ctx.accounts.node_account;
    node_account.authority = ctx.accounts.authority.key();
    node_account.node_pubkey = node_pubkey;
    node_account.is_active = true;
    node_account.created_at = Clock::get()?.unix_timestamp;
    node_account.last_active = Clock::get()?.unix_timestamp;

    // Add to the registry
    node_registry.nodes.push(node_pubkey);
    Ok(())
}

pub fn remove_node(ctx: Context<RemoveNode>, node_pubkey: Pubkey) -> Result<()> {
    let node_registry = &mut ctx.accounts.node_registry;
    let initial_len = node_registry.nodes.len();
    node_registry.nodes.retain(|&x| x != node_pubkey);
    let final_len = node_registry.nodes.len();

    require!(initial_len > final_len, NodeRegistryError::NodeNotFound);

    // The node_account will be closed automatically by the close = payer attribute
    Ok(())
}

#[derive(Accounts)]
#[instruction(node_pubkey: Pubkey)]
pub struct AddNode<'info> {
    #[account(
        mut,
        has_one = authority
    )]
    pub node_registry: Account<'info, NodeRegistry>,
    
    #[account(
        init,
        payer = authority,
        space = NodeAccount::SPACE,
        seeds = [NodeAccount::SEED_PREFIX, node_pubkey.as_ref()],
        bump
    )]
    pub node_account: Account<'info, NodeAccount>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(node_pubkey: Pubkey)]
pub struct RemoveNode<'info> {
    #[account(
        mut,
        has_one = authority
    )]
    pub node_registry: Account<'info, NodeRegistry>,
    
    #[account(
        mut,
        close = authority,
        seeds = [NodeAccount::SEED_PREFIX, node_pubkey.as_ref()],
        bump
    )]
    pub node_account: Account<'info, NodeAccount>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}
