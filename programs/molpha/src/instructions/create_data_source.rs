use anchor_lang::prelude::*;

use crate::error::DataSourceError;
use crate::state::{DataSource, DataSourceCreated, DataSourceInit, DataSourceType};
use crate::utils::eip712;

pub fn create_data_source(
    ctx: Context<CreateDataSource>,
    data: DataSourceInit,      // same fields as EIP-712
    sig: [u8; 65],
    _secp_ix_index: u8,
) -> Result<()> {
    // 1) Rebuild digest = keccak256("\x19\x01" || domain || structHash)
    let digest = eip712::digest_data_source(&data)?;
    // 2) Verify secp signature using syscall approach
    let signature_rs = &sig[..64]; // r,s components
    let recovery_id = sig[64];
    
    let recovered_pubkey = anchor_lang::solana_program::secp256k1_recover::secp256k1_recover(&digest, recovery_id, signature_rs)
        .map_err(|_| error!(DataSourceError::InvalidEthereumAddress))?;

    // Convert recovered public key to Ethereum address (last 20 bytes of keccak hash)
    let pubkey_hash = anchor_lang::solana_program::keccak::hash(&recovered_pubkey.to_bytes()).to_bytes();
    let mut recovered_eth = [0u8; 20];
    recovered_eth.copy_from_slice(&pubkey_hash[12..32]);

    require!(recovered_eth == data.owner_eth, DataSourceError::RecoveredAddressMismatch);

    // 3) Create the data source
    let clock = Clock::get()?;
    let data_source_account = &mut ctx.accounts.data_source_pda;
    data_source_account.id = eip712::compute_data_source_id(&data).unwrap();
    data_source_account.owner_eth = data.owner_eth;
    data_source_account.is_public = data.data_source_type == DataSourceType::Public;
    data_source_account.created_at = clock.unix_timestamp;
    data_source_account.bump = ctx.bumps.data_source_pda;

    // Emit event
    emit!(DataSourceCreated {
        id: data_source_account.id,
        owner_eth: data.owner_eth,
        is_public: data_source_account.is_public,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(data: DataSourceInit)]
pub struct CreateDataSource<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: This will be initialized as DataSource PDA
    #[account(
        init,
        payer = payer,
        space = DataSource::SPACE,
        seeds = [
            DataSource::SEED_PREFIX,
            &data.get_id(),
        ],
        bump
    )]
    pub data_source_pda: Account<'info, DataSource>,

    pub system_program: Program<'info, System>,
}
