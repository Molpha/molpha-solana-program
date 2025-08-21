use anchor_lang::prelude::*;

use crate::error::FeedError;
use crate::state::{FeedAccount, FeedType, MAX_HISTORY, DataSource, DataSourceInfo, DataSourceType, EthLink};
use crate::events::{FeedCreated, DataSourceCreated};
use crate::utils;

pub fn create_feed(ctx: Context<CreateFeed>, params: CreateFeedParams, data_source_info: DataSourceInfo) -> Result<()> {
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
    
    let feed_account = &mut ctx.accounts.feed_account;
    feed_account.authority = ctx.accounts.authority.key();
    feed_account.feed_type = params.feed_type;
    feed_account.min_signatures_threshold = params.min_signatures_threshold;
    feed_account.frequency = params.frequency;
    feed_account.ipfs_cid = params.ipfs_cid;
    feed_account.feed_id = params.feed_id;
    feed_account.data_source_id = data_source_id;
    feed_account.answer_history = Vec::with_capacity(MAX_HISTORY);

    emit!(FeedCreated {
        id: feed_account.feed_id,
        authority: feed_account.authority,
        feed_type: feed_account.feed_type,
        min_signatures_threshold: feed_account.min_signatures_threshold,
        frequency: feed_account.frequency,
        ipfs_cid: feed_account.ipfs_cid.clone(),
        data_source_id: feed_account.data_source_id,
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
        space = FeedAccount::SPACE,
        seeds = [FeedAccount::SEED_PREFIX, authority.key().as_ref(), params.feed_id.as_ref()],
        bump
    )]
    pub feed_account: Account<'info, FeedAccount>,
    
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
    pub feed_id: [u8; 32],
    pub feed_type: FeedType,
    pub min_signatures_threshold: u8,
    pub frequency: u64,
    pub ipfs_cid: String,
    pub data_source_id: [u8; 32],
}
