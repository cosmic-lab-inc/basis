use crate::constraints::*;
use crate::state::Pool;
use anchor_lang::prelude::*;

pub fn remove_fund<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, RemoveFund<'info>>,
    params: RemoveFundParams,
) -> Result<()> {
    let mut pool = ctx.accounts.pool.load_mut()?;
    pool.remove_fund(params.fund_index as usize)?;
    Ok(())
}

#[derive(Debug, Clone, Copy, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub struct RemoveFundParams {
    pub fund_index: u8,
}

#[derive(Accounts)]
#[instruction(params: RemoveFundParams)]
pub struct RemoveFund<'info> {
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
