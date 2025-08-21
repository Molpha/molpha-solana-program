use anchor_lang::prelude::*;
use super::feed_types::{FeedType, Answer};

pub const MAX_HISTORY: usize = 20; // Reduced from 100 to 20

#[account]
#[derive(Default)]
pub struct FeedAccount {
    pub authority: Pubkey,
    pub feed_type: FeedType,
    pub feed_id: [u8; 32],
    pub data_source_id: [u8; 32],
    pub min_signatures_threshold: u8,
    pub frequency: u64,
    pub ipfs_cid: String,
    pub latest_answer: Answer,
    pub answer_history: Vec<Answer>,
    pub history_idx: u64,
}

impl FeedAccount {
    pub const SEED_PREFIX: &'static [u8] = b"feed";
    pub const SPACE: usize =
        8 + 32 + 32 + 1 + 1 + 8 + (4 + 60) + Answer::SPACE + (4 + (Answer::SPACE * MAX_HISTORY)) + 8;
}
