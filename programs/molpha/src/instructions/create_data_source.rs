use anchor_lang::prelude::*;

use crate::events::DataSourceCreated;
use crate::state::{DataSource, DataSourceInfo};
use crate::utils;

pub fn create_data_source(
    ctx: Context<CreateDataSource>,
    data: DataSourceInfo, // same fields as EIP-712
) -> Result<()> {
    // Use the reusable verification function
    utils::verify_data_source_signature(&data)?;

    // 3) Create the data source
    let clock = Clock::get()?;
    let data_source = &mut ctx.accounts.data_source;
    data_source.id = utils::eip712::compute_data_source_id(&data).unwrap();
    data_source.owner_eth = data.owner_eth;
    data_source.data_source_type = data.data_source_type;
    data_source.created_at = clock.unix_timestamp;
    data_source.bump = ctx.bumps.data_source;

    // Emit event
    emit!(DataSourceCreated {
        id: data_source.id,
        owner_eth: data.owner_eth,
        data_source_type: data_source.data_source_type,
        created_at: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(data: DataSourceInfo)]
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
    pub data_source: Account<'info, DataSource>,

    pub system_program: Program<'info, System>,
}
