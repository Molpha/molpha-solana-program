use crate::state::{DataSourceType, FeedType};
use anchor_lang::prelude::*;

#[event]
pub struct DataSourceCreated {
    pub id: [u8; 32],
    pub owner_eth: [u8; 20],
    pub data_source_type: DataSourceType,
    pub created_at: i64,
}

#[event]
pub struct FeedCreated {
    pub id: [u8; 32],
    pub authority: Pubkey,
    pub feed_type: FeedType,
    pub min_signatures_threshold: u8,
    pub frequency: u64,
    pub ipfs_cid: String,
    pub data_source_id: [u8; 32],
    pub created_at: i64,
}
