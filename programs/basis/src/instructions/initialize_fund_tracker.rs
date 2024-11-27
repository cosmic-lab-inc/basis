use crate::state::FundTracker;
use crate::Size;
use anchor_lang::prelude::*;

pub fn initialize_fund_tracker<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, InitializeFundTracker<'info>>,
) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeFundTracker<'info> {
    /// Admin-level keypair
    pub authority: Signer<'info>,

    #[account(
        init,
        seeds = [b"fund_tracker"],
        space = FundTracker::SIZE,
        bump,
        payer = payer
    )]
    pub fund_tracker: AccountLoader<'info, FundTracker>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}
