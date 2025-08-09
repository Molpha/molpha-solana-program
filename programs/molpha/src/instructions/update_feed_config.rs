use anchor_lang::prelude::*;
use crate::state::{FeedAccount, FeedType};
use crate::error::FeedError;

pub fn update_feed_config(ctx: Context<UpdateFeedConfig>, params: UpdateFeedConfigParams) -> Result<()> {
    let feed_account = &mut ctx.accounts.feed_account;

    require!(feed_account.feed_type == FeedType::Personal, FeedError::NotSupported);
    require!(!params.ipfs_cid.is_empty(), FeedError::InvalidFeedConfig);
    require!(params.min_signatures_threshold > 0, FeedError::InvalidFeedConfig);

    feed_account.min_signatures_threshold = params.min_signatures_threshold;
    feed_account.frequency = params.frequency;
    feed_account.ipfs_cid = params.ipfs_cid;

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateFeedConfig<'info> {
    #[account(
        mut,
        has_one = authority
    )]
    pub feed_account: Account<'info, FeedAccount>,
    pub authority: Signer<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateFeedConfigParams {
    pub min_signatures_threshold: u8,
    pub frequency: u64,
    pub ipfs_cid: String,
} 