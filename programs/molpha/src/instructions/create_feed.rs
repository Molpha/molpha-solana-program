use crate::error::FeedError;
use crate::state::{FeedAccount, FeedType, MAX_HISTORY};
use anchor_lang::prelude::*;

pub fn create_feed(ctx: Context<CreateFeed>, params: CreateFeedParams) -> Result<()> {
    require!(
        params.min_signatures_threshold > 0,
        FeedError::InvalidFeedConfig
    );
    require!(!params.ipfs_cid.is_empty(), FeedError::InvalidFeedConfig);

    let feed_account = &mut ctx.accounts.feed_account;
    feed_account.authority = ctx.accounts.authority.key();
    feed_account.feed_type = params.feed_type;
    feed_account.min_signatures_threshold = params.min_signatures_threshold;
    feed_account.frequency = params.frequency;
    feed_account.ipfs_cid = params.ipfs_cid;
    feed_account.answer_history = Vec::with_capacity(MAX_HISTORY);

    Ok(())
}

#[derive(Accounts)]
#[instruction(params: CreateFeedParams)]
pub struct CreateFeed<'info> {
    #[account(
        init,
        payer = authority,
        space = FeedAccount::SPACE,
        seeds = [FeedAccount::SEED_PREFIX, authority.key().as_ref(), params.feed_id.as_ref()],
        bump
    )]
    pub feed_account: Account<'info, FeedAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateFeedParams {
    pub feed_id: String,
    pub feed_type: FeedType,
    pub min_signatures_threshold: u8,
    pub frequency: u64,
    pub ipfs_cid: String,
}
