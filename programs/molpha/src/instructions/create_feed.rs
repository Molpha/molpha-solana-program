use anchor_lang::prelude::*;

use crate::error::FeedError;
use crate::events::{DataSourceCreated, FeedCreated};
use crate::state::{
    DataSource, DataSourceInfo, DataSourceType, EthLink, Feed, FeedType, MAX_HISTORY,
};
use crate::utils;

pub fn create_feed(
    ctx: Context<CreateFeed>,
    params: CreateFeedParams,
    data_source_info: DataSourceInfo,
) -> Result<()> {
    require!(
        params.min_signatures_threshold > 0,
        FeedError::InvalidFeedConfig
    );
    require!(!params.ipfs_cid.is_empty(), FeedError::InvalidFeedConfig);

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

    let now = Clock::get()?.unix_timestamp;
    // Create the data source if it doesn't exist
    let data_source = &mut ctx.accounts.data_source;
    if data_source.created_at == 0 {
        data_source.id = data_source_id;
        data_source.owner_eth = data_source_info.owner_eth;
        data_source.data_source_type = data_source_info.data_source_type;
        data_source.created_at = now;
        data_source.bump = ctx.bumps.data_source;

        emit!(DataSourceCreated {
            id: data_source.id,
            owner_eth: data_source_info.owner_eth,
            data_source_type: data_source.data_source_type,
            created_at: now,
        });
    }

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

    emit!(FeedCreated {
        id: feed.job_id,
        authority: feed.authority,
        feed_type: feed.feed_type,
        min_signatures_threshold: feed.min_signatures_threshold,
        frequency: feed.frequency,
        ipfs_cid: feed.ipfs_cid.clone(),
        data_source_id: feed.data_source_id,
        created_at: now,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(params: CreateFeedParams, data_source_info: DataSourceInfo)]
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
