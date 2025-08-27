use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default, InitSpace)]
pub enum FeedType {
    #[default]
    Public,
    Personal,
}

impl FeedType {
    pub fn to_u8(&self) -> u8 {
        *self as u8
    }
    pub fn to_seed(&self) -> [u8; 1] {
        [self.to_u8()]
    }
}
