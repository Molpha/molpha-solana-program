use crate::error::FeedError;
use crate::state::{Answer, FeedAccount, FeedType, NodeRegistry, ProtocolConfig, SubscriptionAccount, MAX_HISTORY};
use crate::utils::parse_ed25519_instruction;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{ed25519_program, sysvar};

pub fn publish_answer(ctx: Context<PublishAnswer>, answer: Answer) -> Result<()> {
    let feed_account = &mut ctx.accounts.feed_account;
    let clock = Clock::get()?;

    require!(
        answer.timestamp > feed_account.latest_answer.timestamp,
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
        unique_valid_signers.len() >= feed_account.min_signatures_threshold as usize,
        FeedError::NotEnoughSignatures
    );

    // Hybrid Logic: Charge a fee only for Personal Feeds
    if feed_account.feed_type == FeedType::Personal {
        let subscription_account = &mut ctx.accounts.subscription_account.as_mut().unwrap();
        let config = &ctx.accounts.protocol_config;

        // Check balance and deduct fee
        require!(
            subscription_account.balance >= config.fee_per_update,
            FeedError::InsufficientBalance
        );
        subscription_account.balance -= config.fee_per_update;
    }

    feed_account.latest_answer = answer;

    // Use a ring buffer for history
    if feed_account.answer_history.len() < MAX_HISTORY {
        feed_account.answer_history.push(answer);
        feed_account.history_idx = feed_account.answer_history.len() as u64;
    } else {
        let history_idx = feed_account.history_idx as usize;
        feed_account.answer_history[history_idx] = answer;
        feed_account.history_idx = (history_idx as u64 + 1) % MAX_HISTORY as u64;
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
    pub feed_account: Account<'info, FeedAccount>,
    
    /// CHECK: This is safe. We only read the nodes list for validation.
    pub node_registry: Account<'info, NodeRegistry>,
    
    pub protocol_config: Account<'info, ProtocolConfig>,
    /// CHECK: This is safe. The subscription account is only required for personal feeds,
    /// and we check its address and balance inside the instruction.
    #[account(mut)]
    pub subscription_account: Option<Account<'info, SubscriptionAccount>>,
    /// CHECK: This is the Instructions sysvar, which is safe to use.
    #[account(address = sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}
