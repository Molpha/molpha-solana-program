use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::Instruction, keccak, secp256k1_program,
    sysvar::instructions::load_instruction_at_checked,
};

/// Parse and verify a secp256k1 instruction from the instructions sysvar
pub fn verify_secp256k1_instruction(
    instructions_sysvar: &AccountInfo,
    secp_ix_index: u8,
    expected_digest: &[u8; 32],
) -> Result<[u8; 20]> {
    // Load the secp256k1 instruction
    let secp_instruction = load_instruction_at_checked(secp_ix_index as usize, instructions_sysvar)
        .map_err(|_| error!(crate::error::DataSourceError::InvalidSecp256k1Instruction))?;

    // Verify it's a secp256k1 program instruction
    if secp_instruction.program_id != secp256k1_program::id() {
        return Err(error!(
            crate::error::DataSourceError::InvalidSecp256k1Instruction
        ));
    }

    // Parse the secp256k1 instruction data
    let secp_data = parse_secp256k1_instruction_data(&secp_instruction)?;

    // Verify the digest matches what we expect
    if secp_data.message_hash != *expected_digest {
        return Err(error!(crate::error::DataSourceError::DigestMismatch));
    }

    // Recover the Ethereum address from the public key
    let eth_address = recover_eth_address(&secp_data.pubkey)?;

    Ok(eth_address)
}

/// Parsed secp256k1 instruction data
#[derive(Debug)]
pub struct Secp256k1InstructionData {
    pub signature: [u8; 64],    // r,s (v is handled separately)
    pub recovery_id: u8,        // v
    pub message_hash: [u8; 32], // The digest that was signed
    pub pubkey: [u8; 64],       // Recovered public key
}

/// Parse secp256k1 instruction data
fn parse_secp256k1_instruction_data(instruction: &Instruction) -> Result<Secp256k1InstructionData> {
    let data = &instruction.data;

    // Validate minimum header length (16 bytes)
    if data.len() < 16 {
        return Err(error!(
            crate::error::DataSourceError::InvalidSecp256k1Instruction
        ));
    }

    let num_signatures = data[0];
    if num_signatures != 1 {
        return Err(error!(
            crate::error::DataSourceError::InvalidSecp256k1Instruction
        ));
    }

    // Parse header offsets (following Ed25519 format)
    let signature_offset = u16::from_le_bytes([data[2], data[3]]) as usize;
    let public_key_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let message_data_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let message_data_size = u16::from_le_bytes([data[12], data[13]]) as usize;

    // Validate data length
    if data.len() < message_data_offset + message_data_size {
        return Err(error!(
            crate::error::DataSourceError::InvalidSecp256k1Instruction
        ));
    }

    // Extract signature (r,s) - 64 bytes
    let mut signature = [0u8; 64];
    signature.copy_from_slice(&data[signature_offset..signature_offset + 64]);

    // Extract recovery ID - 1 byte (after signature)
    let recovery_id = data[signature_offset + 64];

    // Extract message hash
    if message_data_size != 32 {
        return Err(error!(
            crate::error::DataSourceError::InvalidSecp256k1Instruction
        ));
    }
    let mut message_hash = [0u8; 32];
    message_hash.copy_from_slice(&data[message_data_offset..message_data_offset + 32]);

    // Extract recovered public key - 64 bytes
    let mut pubkey = [0u8; 64];
    pubkey.copy_from_slice(&data[public_key_offset..public_key_offset + 64]);

    Ok(Secp256k1InstructionData {
        signature,
        recovery_id,
        message_hash,
        pubkey,
    })
}

/// Recover Ethereum address from secp256k1 public key
fn recover_eth_address(pubkey: &[u8; 64]) -> Result<[u8; 20]> {
    // Ethereum address is the last 20 bytes of keccak256(pubkey)
    let pubkey_hash = keccak::hash(pubkey).to_bytes();
    let mut eth_address = [0u8; 20];
    eth_address.copy_from_slice(&pubkey_hash[12..32]);
    Ok(eth_address)
}
