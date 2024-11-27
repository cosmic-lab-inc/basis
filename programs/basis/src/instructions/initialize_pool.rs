use crate::state::Pool;
use crate::Size;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token};

pub fn initialize_pool<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, InitializePool<'info>>,
) -> Result<()> {
    let bump = ctx.bumps.pool;

    let mut pool = ctx.accounts.pool.load_init()?;
    pool.pubkey = *ctx.accounts.pool.to_account_info().key;
    pool.authority = *ctx.accounts.authority.key;
    pool.basis_mint = *ctx.accounts.basis_mint.to_account_info().key;
    pool.usdc_mint = *ctx.accounts.usdc_mint.to_account_info().key;
    pool.init_ts = Clock::get()?.unix_timestamp;
    pool.bump = bump;

    Ok(())
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    /// To-be authority of the [`Pool`]
    pub authority: Signer<'info>,

    #[account(
        init,
        seeds = [b"pool", basis_mint.key().as_ref()],
        space = Pool::SIZE,
        bump,
        payer = payer
    )]
    pub pool: AccountLoader<'info, Pool>,

    #[account(
        init,
        payer = payer,
        mint::decimals = 6,
        mint::authority = pool,
    )]
    pub basis_mint: Box<Account<'info, Mint>>,
    pub usdc_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}
