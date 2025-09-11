use anchor_lang::prelude::*;

pub mod error;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;
use state::*;

declare_id!("7MgLh8MFfPrs4Jmx9z3hTq7oapXavoZQ2UXJmy3vdozx");

#[program]
pub mod molpha {
    use super::*;

    // Node registry functions (from molpha-solana)
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize(ctx)
    }

    pub fn add_node(ctx: Context<AddNode>, node_pubkey: Pubkey) -> Result<()> {
        instructions::add_node(ctx, node_pubkey)
    }

    pub fn remove_node(ctx: Context<RemoveNode>, node_pubkey: Pubkey) -> Result<()> {
        instructions::remove_node(ctx, node_pubkey)
    }

    // pub fn verify_signatures(
    //     ctx: Context<VerifySignatures>,
    //     message: Vec<u8>,
    //     min_signatures_threshold: u8,
    //     answer: state::Answer,
    // ) -> Result<()> {
    //     instructions::verify_signatures(ctx, message, min_signatures_threshold, answer)
    // }

    // Feed management functions (from molpha-feed)
    pub fn create_feed(
        ctx: Context<CreateFeed>,
        params: CreateFeedParams,
        data_source_info: DataSourceInfo,
        subscription_duration_seconds: u64,
        priority_fee_budget: u64,
    ) -> Result<()> {
        instructions::create_feed(ctx, params, data_source_info, subscription_duration_seconds, priority_fee_budget)
    }

    pub fn extend_subscription(
        ctx: Context<ExtendSubscription>,
        additional_duration_seconds: u64,
        additional_priority_fee_budget: u64,
    ) -> Result<()> {
        instructions::extend_subscription(ctx, additional_duration_seconds, additional_priority_fee_budget)
    }

    pub fn update_feed_config(
        ctx: Context<UpdateFeedConfig>,
        params: UpdateFeedConfigParams,
    ) -> Result<()> {
        instructions::update_feed_config(ctx, params)
    }

    pub fn publish_answer(ctx: Context<PublishAnswer>, answer: state::Answer) -> Result<()> {
        instructions::publish_answer(ctx, answer)
    }

    pub fn initialize_protocol(ctx: Context<InitializeProtocol>, fee: u64) -> Result<()> {
        instructions::initialize_protocol(ctx, fee)
    }

    pub fn top_up(ctx: Context<TopUp>, amount: u64) -> Result<()> {
        instructions::top_up(ctx, amount)
    }

    // Data source management functions
    pub fn create_data_source(
        ctx: Context<CreateDataSource>,
        data: state::DataSourceInfo,
    ) -> Result<()> {
        instructions::create_data_source(ctx, data)
    }

    pub fn permit(
        ctx: Context<Permit>,
        owner_eth: [u8; 20],
        grantee: [u8; 32],
        sig: [u8; 65],
    ) -> Result<()> {
        instructions::permit(ctx, owner_eth, grantee, sig)
    }

    pub fn revoke_permit(
        ctx: Context<RevokePermit>,
        owner_eth: [u8; 20],
        grantee: [u8; 32],
        sig: [u8; 65],
    ) -> Result<()> {
        instructions::revoke_permit(ctx, owner_eth, grantee, sig)
    }
}
