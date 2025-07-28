use anchor_lang::prelude::*;
use anchor_lang::solana_program::{ed25519_program, sysvar};
use crate::state::NodeRegistry;
use crate::error::NodeRegistryError;
use crate::utils::parse_ed25519_instruction;
use molpha_feed::cpi::accounts::PublishAnswer;
use molpha_feed::program::MolphaFeed;
use molpha_feed::{self, state as feed_state};


pub fn verify_signatures(
    ctx: Context<VerifySignatures>,
    message: Vec<u8>,
    min_signatures_threshold: u8,
    answer: feed_state::Answer
) -> Result<()> {
    let instructions_sysvar = &ctx.accounts.instructions;
    let current_instruction_index =
        sysvar::instructions::load_current_index_checked(instructions_sysvar)?;

    let mut unique_valid_signers = Vec::new();

    for i in (0..current_instruction_index).rev() {
        let instruction =
            sysvar::instructions::load_instruction_at_checked(i as usize, instructions_sysvar)?;

        if instruction.program_id == ed25519_program::ID {
            if let Ok((signer_pubkey, signed_message)) = parse_ed25519_instruction(&instruction) {
                if signed_message == message
                    && ctx.accounts.node_registry.nodes.contains(&signer_pubkey)
                    && !unique_valid_signers.contains(&signer_pubkey)
                {
                    unique_valid_signers.push(signer_pubkey);
                }
            }
        }
    }

    require!(
        unique_valid_signers.len() >= min_signatures_threshold as usize,
        NodeRegistryError::NotEnoughSignatures
    );

    // CPI to the feed program
    let cpi_program = ctx.accounts.feed_program.to_account_info();
    let cpi_accounts = PublishAnswer {
        feed_account: ctx.accounts.feed_account.to_account_info(),
        node_registry: ctx.accounts.node_registry.to_account_info(),
        protocol_config: ctx.accounts.protocol_config.to_account_info(),
        subscription_account: Some(ctx.accounts.subscription_account.to_account_info()),
    };
    let seeds = &[&NodeRegistry::SEED_PREFIX[..], &[ctx.bumps.node_registry]];
    let signer = &[&seeds[..]];
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
    molpha_feed::cpi::publish_answer(cpi_ctx, answer)?;


    msg!(
        "Successfully verified {} signatures and published answer.",
        unique_valid_signers.len()
    );

    Ok(())
}

#[derive(Accounts)]
pub struct VerifySignatures<'info> {
    #[account(
        seeds = [NodeRegistry::SEED_PREFIX],
        bump
    )]
    pub node_registry: Account<'info, NodeRegistry>,
    /// CHECK: This is the account that the answer will be published to.
    #[account(mut)]
    pub feed_account: UncheckedAccount<'info>,
    pub feed_program: Program<'info, MolphaFeed>,
    /// CHECK: This is safe. The subscription account is only required for personal feeds.
    #[account(mut)]
    pub subscription_account: UncheckedAccount<'info>,
    /// CHECK: This is safe. The protocol config account is required for all feeds.
    pub protocol_config: UncheckedAccount<'info>,
    /// CHECK: This is the Instructions sysvar, which is safe to use.
    #[account(address = sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}
