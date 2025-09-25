use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct Answer {
    pub value: [u8; 32],
    pub timestamp: i64,
}

impl Answer {
    pub const SPACE: usize = Answer::INIT_SPACE;
}
