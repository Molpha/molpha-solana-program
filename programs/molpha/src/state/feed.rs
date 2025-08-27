use super::{Answer, FeedType};
use anchor_lang::prelude::*;

pub const MAX_HISTORY: usize = 20; // Reduced from 100 to 20

#[account]
#[derive(Default, InitSpace)]
pub struct Feed {
    #[max_len(64)]
    pub name: String,
    pub authority: Pubkey,
    pub feed_type: FeedType,
    pub job_id: [u8; 32],
    pub data_source_id: [u8; 32],
    pub balance: u64,
    pub min_signatures_threshold: u8,
    pub frequency: u64,
    #[max_len(60)]
    pub ipfs_cid: String,
    pub latest_answer: Answer,
    #[max_len(MAX_HISTORY)]
    pub answer_history: Vec<Answer>,
    pub history_idx: u64,
}

impl Feed {
    pub const SEED_PREFIX: &'static [u8] = b"feed";
    pub const SPACE: usize = Feed::INIT_SPACE;
}
