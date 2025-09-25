use anchor_lang::prelude::*;

pub mod error;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;
use state::*;

declare_id!("2byMSUvpsSHp3xw7M4QNm2y4PLbfmUELNJrj2qwWPyLM");

#[program]
pub mod molpha {
    use super::*;

    // Node registry and protocol initialization
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize(ctx)
    }

    pub fn add_node(ctx: Context<AddNode>, node_pubkey: Pubkey) -> Result<()> {
        instructions::add_node(ctx, node_pubkey)
    }

    pub fn remove_node(ctx: Context<RemoveNode>, node_pubkey: Pubkey) -> Result<()> {
        instructions::remove_node(ctx, node_pubkey)
    }

    // Feed management functions (from molpha-feed)
    pub fn create_feed(
        ctx: Context<CreateFeed>,
        params: CreateFeedParams,
        subscription_duration_seconds: u64,
        priority_fee_budget: u64,
    ) -> Result<()> {
        instructions::create_feed(ctx, params, subscription_duration_seconds, priority_fee_budget)
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

    pub fn publish_answer(ctx: Context<PublishAnswer>, answer: Answer) -> Result<()> {
        instructions::publish_answer(ctx, answer)
    }

    pub fn top_up(ctx: Context<TopUp>, amount: u64) -> Result<()> {
        instructions::top_up(ctx, amount)
    }

    // Data source management functions
    pub fn create_data_source(
        ctx: Context<CreateDataSource>,
        data: DataSourceInfo,
    ) -> Result<()> {
        instructions::create_data_source(ctx, data)
    }
}
