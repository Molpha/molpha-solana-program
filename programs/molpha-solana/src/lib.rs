use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod molpha_solana {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::initialize(ctx)
    }

    pub fn add_node(ctx: Context<ManageNode>, node_pubkey: Pubkey) -> Result<()> {
        instructions::manage_node::add_node(ctx, node_pubkey)
    }

    pub fn remove_node(ctx: Context<ManageNode>, node_pubkey: Pubkey) -> Result<()> {
        instructions::manage_node::remove_node(ctx, node_pubkey)
    }

    pub fn verify_signatures(
        ctx: Context<VerifySignatures>,
        message: Vec<u8>,
        min_signatures_threshold: u8,
        answer: molpha_feed::state::Answer,
    ) -> Result<()> {
        instructions::verify_signatures::verify_signatures(
            ctx,
            message,
            min_signatures_threshold,
            answer,
        )
    }
}
