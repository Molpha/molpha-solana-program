use anchor_lang::prelude::*;

use crate::utils::eip712;

#[account]
#[derive(Default)]
pub struct DataSource {
    pub id: [u8; 32], // keccak256 hash of the data
    pub owner_eth: [u8; 20], // Ethereum address of the owner
    pub data_source_type: DataSourceType, // Type of data source
    pub created_at: i64, // Creation timestamp
    pub bump: u8, // PDA bump
}

impl DataSource {
    pub const SEED_PREFIX: &'static [u8] = b"data_source";
    pub const SPACE: usize = 8 + 32 + 20 + 1 + 8 + 1; // discriminator + id + owner_eth + data_source_type + created_at + bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum DataSourceType {
    Public,
    Private,
}

impl Default for DataSourceType {
    fn default() -> Self {
        DataSourceType::Private
    }
}

impl DataSourceType {
    pub fn to_seed(&self) -> &[u8] {
        match self {
            Self::Public => &[0],
            Self::Private => &[1],
        }
    }
}

/// DataSourceInit - matches EIP-712 structure exactly
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct DataSourceInfo {
    pub data_source_type: DataSourceType,  // type field (first in EIP-712)
    pub source: String,                    // source field (second in EIP-712)
    pub owner_eth: [u8; 20],              // owner field (third in EIP-712)
    pub name: String,                     // name field (fourth in EIP-712)
    pub sig: [u8; 65],
}

impl DataSourceInfo {
    pub fn to_seed(&self) -> [u8; 32] {
        eip712::compute_data_source_id(self).unwrap()
    }
    pub fn get_id(&self) -> [u8; 32] {
        eip712::compute_data_source_id(self).unwrap()
    }
}