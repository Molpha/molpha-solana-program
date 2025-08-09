use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("GRguUVXULUZzYdhWBSmWVhkKNnL3zRAXagiK3XfTnAbu");

#[program]
pub mod molpha {
    use super::*;

    // Node registry functions (from molpha-solana)
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::initialize(ctx)
    }

    pub fn add_node(ctx: Context<ManageNode>, node_pubkey: Pubkey) -> Result<()> {
        instructions::manage_node::add_node(ctx, node_pubkey)
    }

    pub fn remove_node(ctx: Context<ManageNode>, node_pubkey: Pubkey) -> Result<()> {
        instructions::manage_node::remove_node(ctx, node_pubkey)
    }

    pub fn verify_signatures(
        ctx: Context<VerifySignatures>,
        message: Vec<u8>,
        min_signatures_threshold: u8,
        answer: state::Answer,
    ) -> Result<()> {
        instructions::verify_signatures::verify_signatures(
            ctx,
            message,
            min_signatures_threshold,
            answer,
        )
    }

    // Feed management functions (from molpha-feed)
    pub fn create_feed(ctx: Context<CreateFeed>, params: CreateFeedParams) -> Result<()> {
        instructions::create_feed::create_feed(ctx, params)
    }

    pub fn update_feed_config(
        ctx: Context<UpdateFeedConfig>,
        params: UpdateFeedConfigParams,
    ) -> Result<()> {
        instructions::update_feed_config::update_feed_config(ctx, params)
    }

    pub fn publish_answer(ctx: Context<PublishAnswer>, answer: state::Answer) -> Result<()> {
        instructions::publish_answer::publish_answer(ctx, answer)
    }

    pub fn initialize_protocol(ctx: Context<InitializeProtocol>, fee: u64) -> Result<()> {
        instructions::initialize_protocol::initialize_protocol(ctx, fee)
    }

    pub fn subscribe(ctx: Context<Subscribe>) -> Result<()> {
        instructions::subscribe::subscribe(ctx)
    }

    pub fn top_up(ctx: Context<TopUp>, amount: u64) -> Result<()> {
        instructions::top_up::top_up(ctx, amount)
    }

    // Data source management functions
    pub fn create_data_source(
        ctx: Context<CreateDataSource>,
        data: state::DataSourceInit,
        sig: [u8; 65],
        secp_ix_index: u8,
    ) -> Result<()> {
        instructions::create_data_source::create_data_source(ctx, data, sig, secp_ix_index)
    }
}
