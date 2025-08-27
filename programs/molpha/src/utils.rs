use crate::error::DataSourceError;
use crate::error::NodeRegistryError;
use anchor_lang::prelude::*;
use anchor_lang::solana_program;

pub mod eip712;
pub mod secp;

/// Verifies a data source signature and recovers the Ethereum address
/// This function extracts the common logic from create_data_source for reuse
pub fn verify_data_source_signature(data: &crate::state::DataSourceInfo) -> Result<()> {
    // 1) Rebuild digest = keccak256("\x19\x01" || domain || structHash)
    let digest = crate::utils::eip712::digest_data_source(data)?;

    // 2) Verify secp signature using syscall approach
    let signature_rs = &data.sig[..64]; // r,s components
    let recovery_id = data.sig[64];

    let recovered_pubkey = anchor_lang::solana_program::secp256k1_recover::secp256k1_recover(
        &digest,
        recovery_id,
        signature_rs,
    )
    .map_err(|_| error!(DataSourceError::InvalidEthereumAddress))?;

    // Convert recovered public key to Ethereum address (last 20 bytes of keccak hash)
    let pubkey_hash =
        anchor_lang::solana_program::keccak::hash(&recovered_pubkey.to_bytes()).to_bytes();
    let mut recovered_eth = [0u8; 20];
    recovered_eth.copy_from_slice(&pubkey_hash[12..32]);

    require!(
        recovered_eth == data.owner_eth,
        DataSourceError::RecoveredAddressMismatch
    );

    Ok(())
}

/// Parses a legacy Ed25519 verification instruction to extract the signer's public key and the message.
/// The instruction data format is a 16-byte header followed by data payloads.
/// Header layout:
/// - 0: u8 num_signatures
/// - 1: u8 padding
/// - 2: u16 signature_offset
/// - 4: u16 signature_instruction_index
/// - 6: u16 public_key_offset
/// - 8: u16 public_key_instruction_index
/// - 10: u16 message_data_offset
/// - 12: u16 message_data_size
/// - 14: u16 message_instruction_index
pub fn parse_ed25519_instruction(
    instruction: &solana_program::instruction::Instruction,
) -> Result<(Pubkey, Vec<u8>)> {
    let data = &instruction.data;
    const HEADER_SIZE: usize = 16;

    if data.len() < HEADER_SIZE || data[0] != 1 {
        return err!(NodeRegistryError::InvalidEd25519Instruction);
    }

    let pubkey_offset = u16::from_le_bytes(data[6..8].try_into().unwrap()) as usize;
    let message_offset = u16::from_le_bytes(data[10..12].try_into().unwrap()) as usize;
    let message_size = u16::from_le_bytes(data[12..14].try_into().unwrap()) as usize;

    // Bounds checks
    if pubkey_offset.saturating_add(32) > data.len()
        || message_offset.saturating_add(message_size) > data.len()
    {
        return err!(NodeRegistryError::InvalidEd25519Instruction);
    }

    let pubkey_bytes = &data[pubkey_offset..pubkey_offset + 32];
    let message_bytes = &data[message_offset..message_offset + message_size];

    Ok((
        Pubkey::new_from_array(pubkey_bytes.try_into().unwrap()),
        message_bytes.to_vec(),
    ))
}
