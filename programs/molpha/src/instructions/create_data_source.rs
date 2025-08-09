use anchor_lang::prelude::*;

use crate::error::DataSourceError;
use crate::state::{DataSource, DataSourceCreated, DataSourceData, DataSourceType};
use crate::utils::eip712;
use anchor_lang::solana_program::secp256k1_recover;

pub fn create_data_source(
    ctx: Context<CreateDataSource>,
    data: DataSourceData,
    sig: [u8; 64], // Signature r,s components (no recovery ID)
    recovery_id: u8,
) -> Result<()> {
    let clock = Clock::get()?;

    // Validate input data
    require!(
        !data.name.is_empty(),
        DataSourceError::InvalidDataSourceData
    );

    // Rebuild EIP-712 domain separator and struct hash
    let domain_separator = eip712::build_domain_separator("Molpha Oracles", "1");
    let struct_hash = eip712::build_struct_hash(&data);
    let digest = eip712::build_digest(&domain_separator, &struct_hash);
    


    // Use secp256k1_recover syscall instead of instruction introspection
    let recovered_pubkey = secp256k1_recover::secp256k1_recover(&digest, recovery_id, &sig)
        .map_err(|_| error!(DataSourceError::InvalidEthereumAddress))?;

    // Convert recovered public key to Ethereum address (last 20 bytes of keccak hash)
    let pubkey_hash = anchor_lang::solana_program::keccak::hash(&recovered_pubkey.to_bytes()).to_bytes();
    let mut recovered_eth_address = [0u8; 20];
    recovered_eth_address.copy_from_slice(&pubkey_hash[12..32]);

    // Verify the recovered address matches the data owner
    require!(
        recovered_eth_address == data.owner_eth,
        DataSourceError::InvalidEthereumAddress
    );

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
#[instruction(data: DataSourceData)]
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
