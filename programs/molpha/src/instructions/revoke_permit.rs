use crate::error::DataSourceError;
use crate::events::PermitRevoked;
use crate::state::EthLink;
use crate::utils::eip712;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::secp256k1_recover::secp256k1_recover;

/// Revoke permit instruction - closes the EthLink PDA after signature verification
pub fn revoke_permit(
    ctx: Context<RevokePermit>,
    owner_eth: [u8; 20],
    grantee: [u8; 32],
    sig: [u8; 65],
) -> Result<()> {
    // 1) Rebuild digest = keccak256("\x19\x01" || domain || structHash)
    let digest = eip712::digest_link_solana_grantee(&owner_eth, &grantee)?;

    // 2) Verify secp signature using syscall approach
    let signature_rs = &sig[..64]; // r,s components
    let recovery_id = sig[64];

    let recovered_pubkey = secp256k1_recover(&digest, recovery_id, signature_rs)
        .map_err(|_| error!(DataSourceError::InvalidEthereumAddress))?;

    // Convert recovered public key to Ethereum address (last 20 bytes of keccak hash)
    let pubkey_hash =
        anchor_lang::solana_program::keccak::hash(&recovered_pubkey.to_bytes()).to_bytes();
    let mut recovered_eth = [0u8; 20];
    recovered_eth.copy_from_slice(&pubkey_hash[12..32]);

    require!(
        recovered_eth == owner_eth,
        DataSourceError::PermitRecoveredAddressMismatch
    );

    // 3) Verify the EthLink exists and matches
    let eth_link_account = &ctx.accounts.eth_link_pda;
    require!(
        eth_link_account.owner_eth == owner_eth,
        DataSourceError::EthLinkNotFound
    );
    require!(
        eth_link_account.grantee == grantee,
        DataSourceError::EthLinkNotFound
    );

    // Emit event before closing
    emit!(PermitRevoked {
        permit: ctx.accounts.eth_link_pda.key(),
        owner: ctx.accounts.payer.key(),
        spender_eth: owner_eth,
        revoked_at: Clock::get()?.unix_timestamp,
    });

    // 4) Close the EthLink PDA (transfer lamports back to payer)
    // The close = payer attribute will handle this automatically

    Ok(())
}

#[derive(Accounts)]
#[instruction(owner_eth: [u8; 20], grantee: [u8; 32])]
pub struct RevokePermit<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        close = payer,
        seeds = [
            EthLink::SEED_PREFIX,
            &owner_eth,
            &grantee,
        ],
        bump
    )]
    pub eth_link_pda: Account<'info, EthLink>,
    pub system_program: Program<'info, System>,
}
