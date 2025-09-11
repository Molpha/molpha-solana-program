use crate::error::NodeRegistryError;
use crate::events::{NodeAdded, NodeRemoved};
use crate::state::{Node, NodeRegistry, MAX_NODES};
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
    let node = &mut ctx.accounts.node;
    node.authority = ctx.accounts.authority.key();
    node.node_pubkey = node_pubkey;
    node.is_active = true; 
    node.created_at = Clock::get()?.unix_timestamp;
    node.last_active = Clock::get()?.unix_timestamp;

    // Add to the registry
    node_registry.nodes.push(node_pubkey);

    // Emit event
    emit!(NodeAdded {
        node_registry: ctx.accounts.node_registry.key(),
        node: node_pubkey,
        authority: ctx.accounts.authority.key(),
        added_at: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

pub fn remove_node(ctx: Context<RemoveNode>, node_pubkey: Pubkey) -> Result<()> {
    let node_registry = &mut ctx.accounts.node_registry;
    let initial_len = node_registry.nodes.len();
    node_registry.nodes.retain(|&x| x != node_pubkey);
    let final_len = node_registry.nodes.len();

    require!(initial_len > final_len, NodeRegistryError::NodeNotFound);

    // Emit event
    emit!(NodeRemoved {
        node_registry: ctx.accounts.node_registry.key(),
        node: node_pubkey,
        authority: ctx.accounts.authority.key(),
        removed_at: Clock::get()?.unix_timestamp,
    });

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
        space = Node::SPACE,
        seeds = [Node::SEED_PREFIX, node_pubkey.as_ref()],
        bump
    )]
    pub node: Account<'info, Node>,

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
        seeds = [Node::SEED_PREFIX, node_pubkey.as_ref()],
        bump
    )]
    pub node: Account<'info, Node>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
