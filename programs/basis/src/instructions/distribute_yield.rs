use crate::constraints::*;
use crate::state::Pool;
use anchor_lang::prelude::*;

pub fn distribute_yield<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, DistributeYield<'info>>,
) -> Result<()> {
    let mut pool = ctx.accounts.pool.load_mut()?;

    Ok(())
}

#[derive(Accounts)]
pub struct DistributeYield<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = is_authority_for_pool(&pool, &authority)?,
    )]
    pub pool: AccountLoader<'info, Pool>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}
