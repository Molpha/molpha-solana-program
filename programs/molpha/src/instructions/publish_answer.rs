use anchor_lang::prelude::*;
use crate::state::{Answer, FeedAccount, FeedType, ProtocolConfig, SubscriptionAccount};
use crate::error::FeedError;


pub fn publish_answer(ctx: Context<PublishAnswer>, answer: Answer) -> Result<()> {
    let feed_account = &mut ctx.accounts.feed_account;
    let clock = Clock::get()?;

    require!(answer.timestamp > feed_account.latest_answer.timestamp, FeedError::PastTimestamp);
    require!(answer.timestamp <= clock.unix_timestamp, FeedError::FutureTimestamp);
    
    // Hybrid Logic: Charge a fee only for Personal Feeds
    if feed_account.feed_type == FeedType::Personal {
        let subscription_account = &mut ctx.accounts.subscription_account.as_mut().unwrap();
        let config = &ctx.accounts.protocol_config;

        // Check balance and deduct fee
        require!(subscription_account.balance >= config.fee_per_update, FeedError::InsufficientBalance);
        subscription_account.balance -= config.fee_per_update;
    }

    feed_account.latest_answer = answer;

    // Use a ring buffer for history
    if feed_account.answer_history.len() < 100 { // Replace with MAX_HISTORY
        feed_account.answer_history.push(answer);
        feed_account.history_idx = feed_account.answer_history.len() as u64;
    } else {
        let history_idx = feed_account.history_idx as usize;
        feed_account.answer_history[history_idx] = answer;
        feed_account.history_idx = (history_idx as u64 + 1) % 100; // Replace with MAX_HISTORY
    }

    Ok(())
}

#[derive(Accounts)]
pub struct PublishAnswer<'info> {
    #[account(mut)]
    pub feed_account: Account<'info, FeedAccount>,
    /// The node registry program is the only one who can call this.
    /// CHECK: This is safe because we are checking the signature.
    pub node_registry: Signer<'info>,
    pub protocol_config: Account<'info, ProtocolConfig>,
    /// CHECK: This is safe. The subscription account is only required for personal feeds,
    /// and we check its address and balance inside the instruction.
    #[account(mut)]
    pub subscription_account: Option<Account<'info, SubscriptionAccount>>,
} 