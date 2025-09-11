use crate::error::FeedError;
use crate::events::AnswerPublished;
use crate::state::{
    Answer, Feed, NodeRegistry, MAX_HISTORY
};
use crate::utils::{parse_ed25519_instruction, pricing::*};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{ed25519_program, sysvar};

pub fn publish_answer(ctx: Context<PublishAnswer>, answer: Answer) -> Result<()> {
    let feed = &mut ctx.accounts.feed;
    let clock = Clock::get()?;

    // Check if subscription is active
    require!(
        feed.is_subscription_active(clock.unix_timestamp),
        FeedError::SubscriptionExpired
    );

    require!(
        answer.timestamp > feed.latest_answer.timestamp,
        FeedError::PastTimestamp
    );
    require!(
        answer.timestamp <= clock.unix_timestamp,
        FeedError::FutureTimestamp
    );

    // Calculate actual priority fee paid
    let estimated_compute_units = estimate_compute_units(
        ctx.accounts.node_registry.nodes.len() as u32,
        feed.answer_history.len() as u32,
    );
    
    let priority_fee = calculate_priority_fee_from_instructions(
        &ctx.accounts.instructions,
        estimated_compute_units,
    )?;

    // Check priority fee budgetAS
    require!(
        feed.has_priority_fee_budget(priority_fee),
        FeedError::InsufficientPriorityFeeBudget
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

    // Calculate base fee using EVM-style pricing
    // let base_fee_per_update = (feed.price_per_second_scaled * feed.frequency) / ProtocolConfig::SCALAR;
    // let total_cost = base_fee_per_update + priority_fee;

    // Deduct from feed balance
    require!(
        feed.balance >= priority_fee,
        FeedError::InsufficientBalance
    );
    
    feed.balance -= priority_fee;
    feed.consumed_priority_fees += priority_fee;

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
        "Successfully published answer with {} valid signatures. Priority fee: {}",
        unique_valid_signers.len(),
        priority_fee
    );

    // Emit event
    emit!(AnswerPublished {
        feed: ctx.accounts.feed.key(),
        answer,
        signatures_count: unique_valid_signers.len() as u8,
        published_at: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct PublishAnswer<'info> {
    #[account(
        mut,
        constraint = feed.is_subscription_active(Clock::get()?.unix_timestamp) @ FeedError::SubscriptionExpired,
        seeds = [
            Feed::SEED_PREFIX, 
            feed.authority.as_ref(), 
            feed.name.as_bytes().as_ref(), 
            feed.feed_type.to_seed().as_ref(), 
            feed.min_signatures_threshold.to_le_bytes().as_ref(), 
            feed.frequency.to_le_bytes().as_ref(), 
            feed.job_id.as_ref()
        ],
        bump = feed.bump
    )]
    pub feed: Account<'info, Feed>,

    #[account(
        mut,
        seeds = [NodeRegistry::SEED_PREFIX],
        bump
    )]
    pub node_registry: Account<'info, NodeRegistry>,

    /// CHECK: This is safe. We only read the instructions sysvar for validation.
    #[account(address = sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}
