use crate::state::Feed;
use anchor_lang::prelude::*;

pub fn top_up(ctx: Context<TopUp>, amount: u64) -> Result<()> {
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.authority.to_account_info(),
            to: ctx.accounts.feed.to_account_info(),
        },
    );
    anchor_lang::system_program::transfer(cpi_context, amount)?;

    ctx.accounts.feed.balance += amount;

    Ok(())
}

#[derive(Accounts)]
pub struct TopUp<'info> {
    #[account(
        mut,
        has_one = authority
    )]
    pub feed: Account<'info, Feed>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}
