use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;

/// Get the EIP-712 domain type hash
pub fn get_eip712_domain_type_hash() -> [u8; 32] {
    keccak::hashv(&[
        b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
    ])
    .to_bytes()
}

/// Get the DataSource struct type hash for EIP-712
pub fn get_data_source_type_hash() -> [u8; 32] {
    keccak::hashv(&[b"DataSource(uint8 type,string source,address owner,string name)"]).to_bytes()
}

/// Build the EIP-712 domain separator - use hardcoded value from Solidity contract
pub fn build_domain_separator(_name: &str, _version: &str) -> [u8; 32] {
    // Hardcoded DOMAIN_SEPARATOR from DataSourceRegistry.sol
    // bytes32 private constant DOMAIN_SEPARATOR = 0x91af22df910089dce34bc41d0790bb4a1beee77dda588667c082bb964143739f;
    [
        0x91, 0xaf, 0x22, 0xdf, 0x91, 0x00, 0x89, 0xdc, 0xe3, 0x4b, 0xc4, 0x1d, 0x07, 0x90, 0xbb,
        0x4a, 0x1b, 0xee, 0xe7, 0x7d, 0xda, 0x58, 0x86, 0x67, 0xc0, 0x82, 0xbb, 0x96, 0x41, 0x43,
        0x73, 0x9f,
    ]
}

/// Build the struct hash for DataSourceInit - match Solidity contract exactly
pub fn build_struct_hash(data: &crate::state::DataSourceInit) -> [u8; 32] {
    let type_hash = get_data_source_type_hash();
    let source_hash = keccak::hash(data.source.as_bytes()).to_bytes();
    let name_hash = keccak::hash(data.name.as_bytes()).to_bytes();

    // Convert data_source_type to u8 and pad to 32 bytes for EIP-712
    let mut data_source_type_bytes = [0u8; 32];
    data_source_type_bytes[31] = match data.data_source_type {
        crate::state::DataSourceType::Public => 0u8,
        crate::state::DataSourceType::Private => 1u8,
    };

    // Pad owner_eth to 32 bytes (left-padded with zeros for address type)
    let mut owner_eth_padded = [0u8; 32];
    owner_eth_padded[12..32].copy_from_slice(&data.owner_eth);

    // Match Solidity parameter order: (type, source, owner, name)
    keccak::hashv(&[
        &type_hash,
        &data_source_type_bytes,
        &source_hash,
        &owner_eth_padded,
        &name_hash,
    ])
    .to_bytes()
}

/// Build the final EIP-712 digest
pub fn build_digest(domain_separator: &[u8; 32], struct_hash: &[u8; 32]) -> [u8; 32] {
    keccak::hashv(&[
        b"\x19\x01",
        domain_separator.as_slice(),
        struct_hash.as_slice(),
    ])
    .to_bytes()
}

/// Main function to compute EIP-712 digest for DataSourceInit
pub fn digest_data_source(data: &crate::state::DataSourceInit) -> Result<[u8; 32]> {
    let domain_separator = build_domain_separator("Molpha Oracles", "1");
    let struct_hash = build_struct_hash(data);
    Ok(build_digest(&domain_separator, &struct_hash))
}

/// Compute the data source ID from the encoded data
pub fn compute_data_source_id(data: &crate::state::DataSourceInit) -> Result<[u8; 32]> {
    // Serialize the data deterministically
    let mut serialized = Vec::new();
    serialized.push(match data.data_source_type {
        crate::state::DataSourceType::Public => 0u8,
        crate::state::DataSourceType::Private => 1u8,
    });
    serialized.extend_from_slice(data.source.as_bytes());
    serialized.extend_from_slice(&data.owner_eth);
    serialized.extend_from_slice(data.name.as_bytes());

    Ok(keccak::hash(&serialized).to_bytes())
}

/// Compatibility function for old DataSourceData struct
pub fn compute_data_source_id_legacy(data: &crate::state::DataSourceData) -> Result<[u8; 32]> {
    // Serialize the data deterministically
    let mut serialized = Vec::new();
    serialized.push(match data.data_source_type {
        crate::state::DataSourceType::Public => 0u8,
        crate::state::DataSourceType::Private => 1u8,
    });
    serialized.extend_from_slice(data.source.as_bytes());
    serialized.extend_from_slice(&data.owner_eth);
    serialized.extend_from_slice(data.name.as_bytes());

    Ok(keccak::hash(&serialized).to_bytes())
}
