use anchor_lang::prelude::*;

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
