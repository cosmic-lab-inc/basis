use crate::constraints::*;
use crate::cpis::DriftVaultsRequestWithdraw;
use crate::error::ErrorCode;
use crate::math::{Cast, SafeMath};
use crate::state::*;
use crate::{declare_pool_payer_seeds, validate};
use anchor_lang::prelude::*;
use drift::instructions::optional_accounts::AccountMaps;
use drift::state::user::User;
use drift_vaults::cpi::accounts::RequestWithdraw;
use drift_vaults::program::DriftVaults;
use drift_vaults::state::*;

pub fn request_distribute_yield<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, RequestDistributeYield<'info>>,
) -> Result<()> {
    let clock = &Clock::get()?;
    let vault = ctx.accounts.vault.load_mut()?;
    let investor = ctx.accounts.investor.load_mut()?;

    validate!(
        investor.net_deposits > 0,
        ErrorCode::NoDepositsAvailable,
        "Deposits are negative"
    )?;

    // backwards compatible: if last rem acct does not deserialize into [`VaultProtocol`] then it's a legacy vault.
    let mut vp = ctx.vault_protocol();
    vault.validate_vault_protocol(&vp)?;
    let mut vp = vp.as_mut().map(|vp| vp.load_mut()).transpose()?;

    let user = ctx.accounts.drift_user.load()?;
    let spot_market_index = vault.spot_market_index;

    let AccountMaps {
        perp_market_map,
        spot_market_map,
        mut oracle_map,
    } = ctx.load_maps(clock.slot, Some(spot_market_index), vp.is_some())?;
    let vault_equity =
        vault.calculate_equity(&user, &perp_market_map, &spot_market_map, &mut oracle_map)?;

    let InvestmentEquity {
        profit,
        profit_after_share,
        ..
    } = Investment::equity_breakdown(vault_equity, &investor, &vault, &mut vp)?;

    msg!("profit: {}", profit);
    msg!("profit_after_share: {}", profit_after_share);

    validate!(
        profit_after_share > 0,
        ErrorCode::NoYieldAvailable,
        "No yield to distribute"
    )?;

    // todo: the equity available to withdraw is one unit less than the withdraw request (49,999.999999 instead of 50,000)
    //  which leads to the pool ending up with one less unit to redeem for basis.
    //  the problem arises during yield distribution. the "profit after share" is seemingly one unit higher than it should be,
    //  such that withdrawing the original deposits is one unit less than we expect.
    //  rather than worrying about that down the line, we subtract one unit from profit to distribute so that it can be
    //  withdrawn with deposits if need be, so that a depositor can get the fair exchange rate of USDC deposits for their BASIS.
    let usdc_to_withdraw = profit_after_share.cast::<u64>()?.safe_sub(1)?;
    msg!("{} USDC to distribute", usdc_to_withdraw);

    drop(vault);
    drop(user);
    drop(investor);
    drop(vp);

    ctx.request_withdraw(usdc_to_withdraw)?;

    Ok(())
}

#[derive(Accounts)]
pub struct RequestDistributeYield<'info> {
    #[account(mut)]
    pub vault: AccountLoader<'info, Vault>,
    #[account(mut)]
    pub investor: AccountLoader<'info, VaultDepositor>,
    /// CHECK: Seeds validated in CPI to DriftVaults program
    pub drift_user_stats: AccountInfo<'info>,
    pub drift_user: AccountLoader<'info, User>,
    /// CHECK: Seeds validated in CPI to DriftVaults program
    pub drift_state: AccountInfo<'info>,

    #[account(
        mut,
        constraint = is_authority_for_pool(&pool, &authority)?,
    )]
    pub pool: AccountLoader<'info, Pool>,
    pub authority: Signer<'info>,
    /// PDA signer that pays for transaction fees
    #[account(
        mut,
        seeds = [b"pool_payer", pool.key().as_ref()],
        bump,
    )]
    pub pool_payer: SystemAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub drift_vaults_program: Program<'info, DriftVaults>,
}

impl<'info> DriftVaultsRequestWithdraw
    for Context<'_, '_, '_, 'info, RequestDistributeYield<'info>>
{
    fn request_withdraw(&self, usdc: u64) -> Result<()> {
        declare_pool_payer_seeds!(self.accounts.pool, self.bumps.pool_payer, seeds);
        let rem_accts = self.remaining_accounts.to_vec();
        let cpi_program = self.accounts.drift_vaults_program.to_account_info().clone();
        let cpi_accounts = RequestWithdraw {
            vault: self.accounts.vault.to_account_info(),
            vault_depositor: self.accounts.investor.to_account_info(),
            authority: self.accounts.pool_payer.to_account_info(),
            drift_user_stats: self.accounts.drift_user_stats.to_account_info(),
            drift_user: self.accounts.drift_user.to_account_info(),
            drift_state: self.accounts.drift_state.to_account_info(),
        };
        let cpi_context = CpiContext::new_with_signer(cpi_program, cpi_accounts, seeds)
            .with_remaining_accounts(rem_accts);
        drift_vaults::cpi::request_withdraw(cpi_context, usdc, WithdrawUnit::Token)
    }
}
