use crate::constraints::*;
use crate::state::Pool;
use anchor_lang::prelude::*;

pub fn remove_investment<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, RemoveInvestment<'info>>,
    params: RemoveInvestmentParams,
) -> Result<()> {
    let mut pool = ctx.accounts.pool.load_mut()?;
    pool.remove_investment(params.investment_index as usize)?;

    // todo: CPI into DriftVaults to withdraw USDC from vault and transfer back to the pool's USDC vault

    Ok(())
}

#[derive(Debug, Clone, Copy, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub struct RemoveInvestmentParams {
    pub investment_index: u8,
}

#[derive(Accounts)]
#[instruction(params: RemoveInvestmentParams)]
pub struct RemoveInvestment<'info> {
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
