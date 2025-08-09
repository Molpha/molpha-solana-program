use anchor_lang::prelude::*;
use crate::state::{SubscriptionAccount, FeedAccount, FeedType};
use crate::error::FeedError;

pub fn subscribe(ctx: Context<Subscribe>) -> Result<()> {
    let feed_account = &ctx.accounts.feed_account;
    
    let subscription = &mut ctx.accounts.subscription_account;
    subscription.owner = ctx.accounts.payer.key();
    subscription.balance = 0;
    subscription.bump = ctx.bumps.subscription_account;

    match feed_account.feed_type {
        FeedType::Public => {
            subscription.parent_subscription = None;
        },
        FeedType::Personal => {
            require!(ctx.accounts.consumer.key() == feed_account.authority, FeedError::NotFeedOwner);
            subscription.parent_subscription = None;
        }
    }

    Ok(())
}

#[derive(Accounts)]
pub struct Subscribe<'info> {
    #[account(
        init,
        payer = payer,
        space = SubscriptionAccount::SPACE,
        seeds = [SubscriptionAccount::SEED_PREFIX, consumer.key().as_ref(), feed_account.key().as_ref()],
        bump
    )]
    pub subscription_account: Account<'info, SubscriptionAccount>,
    #[account(
        constraint = feed_account.feed_type != FeedType::Personal || feed_account.authority == authority.key() @ FeedError::NotFeedOwner
    )]
    pub feed_account: Account<'info, FeedAccount>,
    /// CHECK: The consumer can be any account.
    pub consumer: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
} 