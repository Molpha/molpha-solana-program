use crate::error::DataSourceError;
use crate::events::PermitCreated;
use crate::state::EthLink;
use crate::utils::eip712;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::secp256k1_recover::secp256k1_recover;

/// Permit instruction - creates an EthLink PDA authorizing grantee for using Ethereum-owned data sources
pub fn permit(
    ctx: Context<Permit>,
    owner_eth: [u8; 20],
    grantee: [u8; 32],
    sig: [u8; 65],
) -> Result<()> {
    // 1) Rebuild digest = keccak256("\x19\x01" || domain || structHash)
    let digest = eip712::digest_permit_grantee(&owner_eth, &grantee)?;

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

    // 3) Create the EthLink PDA
    let clock = Clock::get()?;
    let eth_link_account = &mut ctx.accounts.eth_link_pda;
    eth_link_account.owner_eth = owner_eth;
    eth_link_account.grantee = grantee;
    eth_link_account.created_at = clock.unix_timestamp;
    eth_link_account.bump = ctx.bumps.eth_link_pda;

    // Emit event
    emit!(PermitCreated {
        permit: ctx.accounts.eth_link_pda.key(),
        owner: ctx.accounts.payer.key(),
        spender_eth: owner_eth,
        deadline: 0, // No deadline in this implementation
        nonce: 0, // No nonce in this implementation
        created_at: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(owner_eth: [u8; 20], grantee: [u8; 32])]
pub struct Permit<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = EthLink::SPACE,
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
