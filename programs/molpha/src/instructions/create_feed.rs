use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked},
};

use crate::error::FeedError;
use crate::events::{FeedCreated};
use crate::state::{
    DataSource, DataSourceType, Feed, FeedType, ProtocolConfig, MAX_HISTORY,
};
use crate::utils::pricing::*;

pub fn create_feed(
    ctx: Context<CreateFeed>,
    params: CreateFeedParams,
    subscription_duration_seconds: u64,
    priority_fee_budget: u64,
) -> Result<()> {
    require!(
        params.min_signatures_threshold > 0,
        FeedError::InvalidFeedConfig
    );
    require!(!params.ipfs_cid.is_empty(), FeedError::InvalidFeedConfig);
    require!(
        subscription_duration_seconds >= 86400,
        FeedError::MinimumSubscriptionTime
    ); // At least 1 day

    let data_source = &ctx.accounts.data_source;
    if data_source.data_source_type == DataSourceType::Private {
        require!(
            data_source.owner == ctx.accounts.authority.key(),
            FeedError::InvalidDataSource
        );
    }

    let now = Clock::get()?.unix_timestamp;
    let config = &ctx.accounts.protocol_config;
    let data_source = &mut ctx.accounts.data_source;

    // Initialize feed with basic data
    let feed = &mut ctx.accounts.feed;
    feed.name = params.name;
    feed.authority = ctx.accounts.authority.key();
    feed.feed_type = params.feed_type;
    feed.min_signatures_threshold = params.min_signatures_threshold;
    feed.frequency = params.frequency;
    feed.ipfs_cid = params.ipfs_cid;
    feed.job_id = params.job_id;
    feed.data_source = data_source.key();
    feed.answer_history = Vec::with_capacity(MAX_HISTORY);
    feed.created_at = now;
    feed.bump = ctx.bumps.feed;
    // Calculate subscription pricing (like PricingHelper.calculatePrice)
    let price_per_second_scaled = calculate_price_per_second_scaled(feed, config)?;

    // Calculate total subscription cost
    let base_subscription_cost =
        (price_per_second_scaled * subscription_duration_seconds) / ProtocolConfig::SCALAR;
    let total_cost = base_subscription_cost + priority_fee_budget;

    // Initialize subscription data
    feed.subscription_due_time = now + subscription_duration_seconds as i64;
    feed.price_per_second_scaled = price_per_second_scaled;
    feed.priority_fee_allowance = priority_fee_budget;
    feed.consumed_priority_fees = 0;

    // Transfer tokens from user to program token account
    let decimals = ctx.accounts.underlying_token.decimals;
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.program_token_account.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
        mint: ctx.accounts.underlying_token.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_context = CpiContext::new(cpi_program, cpi_accounts);
    transfer_checked(cpi_context, total_cost, decimals)?;

    feed.balance = total_cost;

    emit!(FeedCreated {
        id: feed.job_id,
        authority: feed.authority,
        feed_type: feed.feed_type,
        min_signatures_threshold: feed.min_signatures_threshold,
        frequency: feed.frequency,
        ipfs_cid: feed.ipfs_cid.clone(),
        data_source: feed.data_source,
        created_at: now,
        subscription_due_time: feed.subscription_due_time,
        base_cost: base_subscription_cost,
        priority_budget: priority_fee_budget,
        total_cost,
    });

    msg!(
        "Feed created with subscription. Duration: {}s, Base cost: {}, Priority budget: {}, Total: {}",
        subscription_duration_seconds,
        base_subscription_cost,
        priority_fee_budget,
        total_cost
    );

    Ok(())
}

#[derive(Accounts)]
#[instruction(params: CreateFeedParams, subscription_duration_seconds: u64, priority_fee_budget: u64)]
pub struct CreateFeed<'info> {
    #[account(
        init,
        payer = authority,
        space = Feed::SPACE,
        seeds = [
            Feed::SEED_PREFIX,
            authority.key().as_ref(),
            params.name.as_bytes().as_ref(),
            params.feed_type.to_seed().as_ref(),
            params.min_signatures_threshold.to_le_bytes().as_ref(),
            params.frequency.to_le_bytes().as_ref(),
            params.job_id.as_ref(),
        ],
        bump
    )]
    pub feed: Account<'info, Feed>,

    /// CHECK: This account is verified to exist and be accessible
    #[account(
        seeds = [
            DataSource::SEED_PREFIX,
            &data_source.owner.as_ref(),
            &data_source.name.as_bytes(),
            data_source.data_source_type.to_seed(),
            ],
        bump,
    )]
    pub data_source: Account<'info, DataSource>,

    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [ProtocolConfig::SEED_PREFIX],
        bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    
    /// User's associated token account to transfer tokens from
    #[account(
        mut,
        associated_token::mint = underlying_token,
        associated_token::authority = authority,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// Program's associated token account to receive tokens
    #[account(
        mut,
        associated_token::mint = underlying_token,
        associated_token::authority = protocol_config,
    )]
    pub program_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// The underlying token mint
    pub underlying_token: InterfaceAccount<'info, Mint>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateFeedParams {
    pub name: String,
    pub job_id: [u8; 32],
    pub feed_type: FeedType,
    pub min_signatures_threshold: u8,
    pub frequency: u64,
    pub ipfs_cid: String,
}
