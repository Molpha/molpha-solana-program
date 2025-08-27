use crate::error::FeedError;
use crate::state::{
    feed, Answer, Feed, FeedType, NodeRegistry, ProtocolConfig, MAX_HISTORY
};
use crate::utils::parse_ed25519_instruction;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{ed25519_program, sysvar};

pub fn publish_answer(ctx: Context<PublishAnswer>, answer: Answer) -> Result<()> {
    let feed = &mut ctx.accounts.feed;
    let clock = Clock::get()?;

    require!(
        answer.timestamp > feed.latest_answer.timestamp,
        FeedError::PastTimestamp
    );
    require!(
        answer.timestamp <= clock.unix_timestamp,
        FeedError::FutureTimestamp
    );

    // Validate signatures from registered nodes
    let instructions_sysvar = &ctx.accounts.instructions;
    let current_instruction_index =
        sysvar::instructions::load_current_index_checked(instructions_sysvar)?;

    let mut unique_valid_signers = Vec::new();
    let message = answer.value.to_vec();

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
        unique_valid_signers.len() >= feed.min_signatures_threshold as usize,
        FeedError::NotEnoughSignatures
    );

    let config = &ctx.accounts.protocol_config;

    // Check balance and deduct fee
    require!(
        feed.balance >= config.fee_per_update,
        FeedError::InsufficientBalance
    );
    feed.balance -= config.fee_per_update;

    feed.latest_answer = answer;

    // Use a ring buffer for history
    if feed.answer_history.len() < MAX_HISTORY {
        feed.answer_history.push(answer);
        feed.history_idx = feed.answer_history.len() as u64;
    } else {
        let history_idx = feed.history_idx as usize;
        feed.answer_history[history_idx] = answer;
        feed.history_idx = (history_idx as u64 + 1) % MAX_HISTORY as u64;
    }

    msg!(
        "Successfully published answer with {} valid signatures.",
        unique_valid_signers.len()
    );

    Ok(())
}

#[derive(Accounts)]
pub struct PublishAnswer<'info> {
    #[account(mut)]
    pub feed: Account<'info, Feed>,

    pub node_registry: Account<'info, NodeRegistry>,

    pub protocol_config: Account<'info, ProtocolConfig>,

    /// CHECK: This is safe. We only read the instructions sysvar for validation.
    #[account(address = sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}
