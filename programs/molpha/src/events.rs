use crate::state::{DataSourceType, FeedType, Answer};
use anchor_lang::prelude::*;

#[event]
pub struct DataSourceCreated {
    pub id: Pubkey,
    pub owner: Pubkey,
    pub data_source_type: DataSourceType,
    pub metadata_hash: [u8; 32],
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
    pub data_source: Pubkey,
    pub created_at: i64,
    pub subscription_due_time: i64,
    pub base_cost: u64,
    pub priority_budget: u64,
    pub total_cost: u64,
}

#[event]
pub struct AnswerPublished {
    pub feed: Pubkey,
    pub answer: Answer,
    pub signatures_count: u8,
    pub published_at: i64,
}

#[event]
pub struct SubscriptionExtended {
    pub feed: Pubkey,
    pub authority: Pubkey,
    pub additional_duration: u64,
    pub additional_priority_budget: u64,
    pub new_due_time: i64,
    pub extended_at: i64,
}

#[event]
pub struct NodeAdded {
    pub node_registry: Pubkey,
    pub node: Pubkey,
    pub authority: Pubkey,
    pub added_at: i64,
}

#[event]
pub struct NodeRemoved {
    pub node_registry: Pubkey,
    pub node: Pubkey,
    pub authority: Pubkey,
    pub removed_at: i64,
}

#[event]
pub struct PermitCreated {
    pub permit: Pubkey,
    pub owner: Pubkey,
    pub spender_eth: [u8; 20],
    pub deadline: u64,
    pub nonce: u64,
    pub created_at: i64,
}

#[event]
pub struct PermitRevoked {
    pub permit: Pubkey,
    pub owner: Pubkey,
    pub spender_eth: [u8; 20],
    pub revoked_at: i64,
}

#[event]
pub struct ProtocolInitialized {
    pub protocol_config: Pubkey,
    pub authority: Pubkey,
    pub initialized_at: i64,
}

#[event]
pub struct FeedConfigUpdated {
    pub feed: Pubkey,
    pub authority: Pubkey,
    pub new_ipfs_cid: String,
    pub updated_at: i64,
}

#[event]
pub struct FeedToppedUp {
    pub feed: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
    pub new_balance: u64,
    pub topped_up_at: i64,
}

#[event]
pub struct NodeRegistryInitialized {
    pub node_registry: Pubkey,
    pub authority: Pubkey,
    pub initialized_at: i64,
}
