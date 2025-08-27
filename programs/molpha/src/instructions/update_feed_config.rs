use crate::error::FeedError;
use crate::state::{Feed, FeedType};
use anchor_lang::prelude::*;

pub fn update_feed_config(
    ctx: Context<UpdateFeedConfig>,
    params: UpdateFeedConfigParams,
) -> Result<()> {
    let feed = &mut ctx.accounts.feed;

    require!(
        feed.feed_type == FeedType::Personal,
        FeedError::NotSupported
    );
    require!(!params.ipfs_cid.is_empty(), FeedError::InvalidFeedConfig);
    require!(
        params.min_signatures_threshold > 0,
        FeedError::InvalidFeedConfig
    );

    feed.min_signatures_threshold = params.min_signatures_threshold;
    feed.frequency = params.frequency;
    feed.ipfs_cid = params.ipfs_cid;

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateFeedConfig<'info> {
    #[account(
        mut,
        has_one = authority
    )]
    pub feed: Account<'info, Feed>,
    pub authority: Signer<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateFeedConfigParams {
    pub min_signatures_threshold: u8,
    pub frequency: u64,
    pub ipfs_cid: String,
}
