use anchor_lang::prelude::*;

pub const MAX_HISTORY: usize = 100;

#[account]
#[derive(Default)]
pub struct FeedAccount {
    pub authority: Pubkey,
    pub feed_type: FeedType,
    pub min_signatures_threshold: u8,
    pub frequency: u64,
    pub ipfs_cid: String,
    pub latest_answer: Answer,
    pub answer_history: Vec<Answer>,
    pub history_idx: u64,
}

impl FeedAccount {
    pub const SEED_PREFIX: &'static [u8] = b"feed";
    pub const SPACE: usize = 8 + 32 + 1 + 1 + 8 + (4 + 60) + Answer::SPACE + (4 + (Answer::SPACE * MAX_HISTORY)) + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum FeedType {
    #[default]
    Public,
    Personal,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct Answer {
    pub value: [u8; 32],
    pub timestamp: i64,
}

impl Answer {
    pub const SPACE: usize = 32 + 8;
}
