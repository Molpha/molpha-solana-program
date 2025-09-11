use anchor_lang::prelude::*;
use crate::error::FeedError;
use crate::events::SubscriptionExtended;
use crate::state::{Feed, ProtocolConfig};

pub fn extend_subscription(
    ctx: Context<ExtendSubscription>,
    additional_duration_seconds: u64,
    additional_priority_fee_budget: u64,
) -> Result<()> {
    // Get feed account info before mutable borrow
    let feed_account_info = ctx.accounts.feed.to_account_info();
    
    let feed = &mut ctx.accounts.feed;

    require!(
        additional_duration_seconds >= 86400, // At least 1 day
        FeedError::MinimumExtensionTime
    );

    let new_due_datetime = if feed.subscription_due_time > Clock::get()?.unix_timestamp {
        feed.subscription_due_time + additional_duration_seconds as i64
    } else {
        Clock::get()?.unix_timestamp + additional_duration_seconds as i64
    };

    // Calculate cost for extension (like SubscriptionRegistry.extendSubscription)
    let base_extension_cost = (feed.price_per_second_scaled * additional_duration_seconds) / ProtocolConfig::SCALAR;
    let total_extension_cost = base_extension_cost + additional_priority_fee_budget;

    // Extend subscription
    feed.subscription_due_time = new_due_datetime;
    feed.priority_fee_allowance += additional_priority_fee_budget;

    // Transfer payment
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.authority.to_account_info(),
            to: feed_account_info,
        },
    );
    anchor_lang::system_program::transfer(cpi_context, total_extension_cost)?;
    
    feed.balance += total_extension_cost;

    msg!(
        "Subscription extended. Additional duration: {}s, Base cost: {}, Priority budget: {}, Total: {}",
        additional_duration_seconds,
        base_extension_cost,
        additional_priority_fee_budget,
        total_extension_cost
    );

    // Emit event
    emit!(SubscriptionExtended {
        feed: ctx.accounts.feed.key(),
        authority: ctx.accounts.authority.key(),
        additional_duration: additional_duration_seconds,
        additional_priority_budget: additional_priority_fee_budget,
        new_due_time: new_due_datetime,
        extended_at: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ExtendSubscription<'info> {
    #[account(
        mut,
        has_one = authority,
    )]
    pub feed: Account<'info, Feed>,

    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}
