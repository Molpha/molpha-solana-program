use crate::state::SubscriptionAccount;
use anchor_lang::prelude::*;

pub fn top_up(ctx: Context<TopUp>, amount: u64) -> Result<()> {
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.owner.to_account_info(),
            to: ctx.accounts.subscription_account.to_account_info(),
        },
    );
    anchor_lang::system_program::transfer(cpi_context, amount)?;

    ctx.accounts.subscription_account.balance += amount;

    Ok(())
}

#[derive(Accounts)]
pub struct TopUp<'info> {
    #[account(
        mut,
        has_one = owner
    )]
    pub subscription_account: Account<'info, SubscriptionAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}
