use anchor_lang::prelude::*;

use crate::error::FeedError;
use crate::events::{DataSourceCreated, FeedCreated};
use crate::state::{
    DataSource, DataSourceInfo, DataSourceType, EthLink, Feed, FeedType, MAX_HISTORY,
    ProtocolConfig,
};
use crate::utils::{self, pricing::*};

pub fn create_feed(
    ctx: Context<CreateFeed>,
    params: CreateFeedParams,
    data_source_info: DataSourceInfo,
    subscription_duration_seconds: u64,
    priority_fee_budget: u64,
) -> Result<()> {
    require!(
        params.min_signatures_threshold > 0,
        FeedError::InvalidFeedConfig
    );
    require!(!params.ipfs_cid.is_empty(), FeedError::InvalidFeedConfig);
    require!(subscription_duration_seconds >= 86400, FeedError::MinimumSubscriptionTime); // At least 1 day

    let data_source = &ctx.accounts.data_source;
    if data_source.data_source_type == DataSourceType::Private {
        require!(
            ctx.accounts.eth_link_pda.is_some(),
            FeedError::InvalidDataSource
        );
    }

    let data_source_id = utils::eip712::compute_data_source_id(&data_source_info).unwrap();
    require!(
        data_source_id == params.data_source_id,
        FeedError::InvalidDataSource
    );
    utils::verify_data_source_signature(&data_source_info)?;

    let clock = Clock::get()?;
    let config = &ctx.accounts.protocol_config;
    // Create the data source if it doesn't exist
    let data_source = &mut ctx.accounts.data_source;
    if data_source.created_at == 0 {
        data_source.id = data_source_id;
        data_source.owner_eth = data_source_info.owner_eth;
        data_source.data_source_type = data_source_info.data_source_type;
        data_source.created_at = clock.unix_timestamp;
        data_source.bump = ctx.bumps.data_source;

        emit!(DataSourceCreated {
            id: data_source.id,
            owner_eth: data_source_info.owner_eth,
            data_source_type: data_source.data_source_type,
            created_at: clock.unix_timestamp,
        });
    }

    // Get feed account info before mutable borrow
    let feed_account_info = ctx.accounts.feed.to_account_info();
    
    // Initialize feed with basic data
    let feed = &mut ctx.accounts.feed;
    feed.name = params.name;
    feed.authority = ctx.accounts.authority.key();
    feed.feed_type = params.feed_type;
    feed.min_signatures_threshold = params.min_signatures_threshold;
    feed.frequency = params.frequency;
    feed.ipfs_cid = params.ipfs_cid;
    feed.job_id = params.job_id;
    feed.data_source_id = data_source_id;
    feed.answer_history = Vec::with_capacity(MAX_HISTORY);
    feed.created_at = clock.unix_timestamp;
    feed.bump = ctx.bumps.feed;
    // Calculate subscription pricing (like PricingHelper.calculatePrice)
    let price_per_second_scaled = calculate_price_per_second_scaled(feed, config)?;
    
    // Calculate total subscription cost
    let base_subscription_cost = (price_per_second_scaled * subscription_duration_seconds) / ProtocolConfig::SCALAR;
    let total_cost = base_subscription_cost + priority_fee_budget;

    // Initialize subscription data
    feed.subscription_due_time = clock.unix_timestamp + subscription_duration_seconds as i64;
    feed.price_per_second_scaled = price_per_second_scaled;
    feed.priority_fee_allowance = priority_fee_budget;
    feed.consumed_priority_fees = 0;

    // Transfer payment to feed (like SubscriptionRegistry deposit)
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.authority.to_account_info(),
            to: feed_account_info,
        },
    );
    anchor_lang::system_program::transfer(cpi_context, total_cost)?;
    
    feed.balance = total_cost;

    emit!(FeedCreated {
        id: feed.job_id,
        authority: feed.authority,
        feed_type: feed.feed_type,
        min_signatures_threshold: feed.min_signatures_threshold,
        frequency: feed.frequency,
        ipfs_cid: feed.ipfs_cid.clone(),
        data_source_id: feed.data_source_id,
        created_at: clock.unix_timestamp,
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
#[instruction(params: CreateFeedParams, data_source_info: DataSourceInfo, subscription_duration_seconds: u64, priority_fee_budget: u64)]
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
        init_if_needed,
        payer = authority,
        space = DataSource::SPACE,
        seeds = [DataSource::SEED_PREFIX, params.data_source_id.as_ref()],
        bump,
    )]
    pub data_source: Account<'info, DataSource>,

    /// CHECK: This account is verified to exist and be accessible
    #[account(
        init_if_needed,
        payer = authority,
        space = EthLink::SPACE,
        seeds = [
            EthLink::SEED_PREFIX,
            data_source_info.owner_eth.as_ref(),
            authority.key().as_ref(),
        ],
        bump,
    )]
    pub eth_link_pda: Option<Account<'info, EthLink>>,

    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        seeds = [ProtocolConfig::SEED_PREFIX],
        bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateFeedParams {
    pub name: String,
    pub data_source_id: [u8; 32],
    pub job_id: [u8; 32],
    pub feed_type: FeedType,
    pub min_signatures_threshold: u8,
    pub frequency: u64,
    pub ipfs_cid: String,
}
