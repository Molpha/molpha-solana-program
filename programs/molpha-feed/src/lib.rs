use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("GRguUVXULUZzYdhWBSmWVhkKNnL3zRAXagiK3XfTnAbu");

#[program]
pub mod molpha_feed {
    use super::*;

    pub fn create_feed(ctx: Context<CreateFeed>, params: CreateFeedParams) -> Result<()> {
        instructions::create_feed::create_feed(ctx, params)
    }

    pub fn update_feed_config(ctx: Context<UpdateFeedConfig>, params: UpdateFeedConfigParams) -> Result<()> {
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
} 