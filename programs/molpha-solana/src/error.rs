use anchor_lang::prelude::*;

#[error_code]
pub enum NodeRegistryError {
    #[msg("The given node public key is a zero key.")]
    ZeroPubkey,
    #[msg("Maximum number of nodes reached.")]
    MaxNodesReached,
    #[msg("Node is already part of the registry.")]
    NodeAlreadyAdded,
    #[msg("Node is not part of the registry.")]
    NodeNotFound,
    #[msg("Not enough valid signatures from registered nodes.")]
    NotEnoughSignatures,
    #[msg("Failed to parse Ed25519 instruction.")]
    InvalidEd25519Instruction,
}
