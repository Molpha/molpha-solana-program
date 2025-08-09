use crate::error::NodeRegistryError;
use crate::state::{
    Answer, FeedAccount, FeedType, NodeRegistry, ProtocolConfig, SubscriptionAccount,
};
use crate::utils::parse_ed25519_instruction;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{ed25519_program, sysvar};

pub fn verify_signatures(
    ctx: Context<VerifySignatures>,
    message: Vec<u8>,
    min_signatures_threshold: u8,
    answer: Answer,
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

    // Direct call to publish answer logic (now in the same program)
    let feed_account = &mut ctx.accounts.feed_account;
    let clock = Clock::get()?;

    require!(
        answer.timestamp > feed_account.latest_answer.timestamp,
        crate::error::FeedError::PastTimestamp
    );
    require!(
        answer.timestamp <= clock.unix_timestamp,
        crate::error::FeedError::FutureTimestamp
    );

    // Hybrid Logic: Charge a fee only for Personal Feeds
    if feed_account.feed_type == FeedType::Personal {
        let subscription_account = &mut ctx.accounts.subscription_account;
        let config = &ctx.accounts.protocol_config;

        // Check balance and deduct fee
        require!(
            subscription_account.balance >= config.fee_per_update,
            crate::error::FeedError::InsufficientBalance
        );
        subscription_account.balance -= config.fee_per_update;
    }

    feed_account.latest_answer = answer;

    // Use a ring buffer for history
    if feed_account.answer_history.len() < 100 {
        // Replace with MAX_HISTORY
        feed_account.answer_history.push(answer);
        feed_account.history_idx = feed_account.answer_history.len() as u64;
    } else {
        let history_idx = feed_account.history_idx as usize;
        feed_account.answer_history[history_idx] = answer;
        feed_account.history_idx = (history_idx as u64 + 1) % 100; // Replace with MAX_HISTORY
    }

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
    #[account(mut)]
    pub feed_account: Account<'info, FeedAccount>,
    #[account(mut)]
    pub subscription_account: Account<'info, SubscriptionAccount>,
    pub protocol_config: Account<'info, ProtocolConfig>,
    /// CHECK: This is the Instructions sysvar, which is safe to use.
    #[account(address = sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}
