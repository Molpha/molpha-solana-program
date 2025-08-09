use crate::error::NodeRegistryError;
use crate::state::{NodeRegistry, MAX_NODES};
use anchor_lang::prelude::*;

pub fn add_node(ctx: Context<ManageNode>, node_pubkey: Pubkey) -> Result<()> {
    require!(
        node_pubkey != Pubkey::default(),
        NodeRegistryError::ZeroPubkey
    );

    let node_registry = &mut ctx.accounts.node_registry;
    require!(
        node_registry.nodes.len() < MAX_NODES,
        NodeRegistryError::MaxNodesReached
    );
    require!(
        !node_registry.nodes.contains(&node_pubkey),
        NodeRegistryError::NodeAlreadyAdded
    );

    node_registry.nodes.push(node_pubkey);
    Ok(())
}

pub fn remove_node(ctx: Context<ManageNode>, node_pubkey: Pubkey) -> Result<()> {
    let node_registry = &mut ctx.accounts.node_registry;
    let initial_len = node_registry.nodes.len();
    node_registry.nodes.retain(|&x| x != node_pubkey);
    let final_len = node_registry.nodes.len();

    require!(initial_len > final_len, NodeRegistryError::NodeNotFound);

    Ok(())
}

#[derive(Accounts)]
pub struct ManageNode<'info> {
    #[account(
        mut,
        has_one = authority
    )]
    pub node_registry: Account<'info, NodeRegistry>,
    pub authority: Signer<'info>,
}
