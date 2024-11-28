use crate::constraints::*;
use crate::state::{FundTracker, Pool};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

pub fn add_fund<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, AddFund<'info>>,
    params: AddFundParams,
) -> Result<()> {
    let mut pool = ctx.accounts.pool.load_mut()?;

    let fund_tracker = FundTracker {
        mint: ctx.accounts.mint.key(),
        token: ctx.accounts.token.key(),
        init_ts: Clock::get()?.unix_timestamp,
        weight: params.weight,
        ..Default::default()
    };

    pool.add_fund(fund_tracker)?;

    Ok(())
}

#[derive(Debug, Clone, Copy, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub struct AddFundParams {
    pub weight: u32,
}

#[derive(Accounts)]
#[instruction(params: AddFundParams)]
pub struct AddFund<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = is_authority_for_pool(&pool, &authority)?,
    )]
    pub pool: AccountLoader<'info, Pool>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = pool
    )]
    pub token: Box<Account<'info, TokenAccount>>,
    pub mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}
