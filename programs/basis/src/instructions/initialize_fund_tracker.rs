use crate::state::{FundTracker, Pool};
use crate::Size;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

pub fn initialize_fund_tracker<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, InitializeFundTracker<'info>>,
) -> Result<()> {
    let bump = ctx.bumps.fund_tracker;

    let mut fund_tracker = ctx.accounts.fund_tracker.load_init()?;
    fund_tracker.pubkey = *ctx.accounts.fund_tracker.to_account_info().key;
    fund_tracker.authority = *ctx.accounts.authority.key;
    fund_tracker.token = *ctx.accounts.token.to_account_info().key;
    fund_tracker.mint = *ctx.accounts.mint.to_account_info().key;
    fund_tracker.init_ts = Clock::get()?.unix_timestamp;
    fund_tracker.bump = bump;

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeFundTracker<'info> {
    #[account(
        init,
        seeds = [b"fund_tracker", pool.key().as_ref(), mint.key().as_ref()],
        space = FundTracker::SIZE,
        bump,
        payer = payer
    )]
    pub fund_tracker: AccountLoader<'info, FundTracker>,

    /// To-be authority of the [`FundTracker`]
    pub authority: Signer<'info>,

    pub pool: AccountLoader<'info, Pool>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = fund_tracker
    )]
    pub token: Box<Account<'info, TokenAccount>>,
    pub mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}
