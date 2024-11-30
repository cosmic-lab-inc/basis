use crate::constraints::*;
use crate::cpis::DriftVaultsRequestWithdraw;
use crate::declare_pool_payer_seeds;
use crate::math::{Cast, SafeMath};
use crate::state::Pool;
use anchor_lang::prelude::*;
use drift::instructions::optional_accounts::AccountMaps;
use drift::state::user::User;
use drift_vaults::cpi::accounts::RequestWithdraw;
use drift_vaults::program::DriftVaults;
use drift_vaults::state::{AccountMapProvider, VaultDepositor, VaultProtocolProvider};
use drift_vaults::state::{Vault, WithdrawUnit};

pub fn request_distribute_yield<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, RequestDistributeYield<'info>>,
) -> Result<()> {
    let clock = &Clock::get()?;
    let vault = ctx.accounts.vault.load_mut()?;
    let vault_depositor = ctx.accounts.investor.load_mut()?;

    // backwards compatible: if last rem acct does not deserialize into [`VaultProtocol`] then it's a legacy vault.
    let mut vp = ctx.vault_protocol();
    vault.validate_vault_protocol(&vp)?;
    let vp = vp.as_mut().map(|vp| vp.load_mut()).transpose()?;

    let user = ctx.accounts.drift_user.load()?;
    let spot_market_index = vault.spot_market_index;

    let AccountMaps {
        perp_market_map,
        spot_market_map,
        mut oracle_map,
    } = ctx.load_maps(clock.slot, Some(spot_market_index), vp.is_some())?;
    let vault_equity =
        vault.calculate_equity(&user, &perp_market_map, &spot_market_map, &mut oracle_map)?;

    msg!("equity: {}", vault_equity);
    msg!("deposits: {}", vault_depositor.net_deposits);

    if vault_depositor.net_deposits <= 0 {
        msg!("Deposits are negative");
        return Ok(());
    }
    if vault_equity <= vault_depositor.net_deposits.cast::<u64>()? {
        msg!("No yield to distribute");
        return Ok(());
    }

    let usdc_to_withdraw = vault_equity.safe_sub(vault_depositor.net_deposits.cast()?)?;
    msg!("{} USDC to distribute", usdc_to_withdraw);

    drop(vault);
    drop(user);
    drop(vault_depositor);
    drop(vp);

    ctx.request_withdraw(usdc_to_withdraw)?;

    Ok(())
}

#[derive(Accounts)]
pub struct RequestDistributeYield<'info> {
    #[account(mut)]
    pub vault: AccountLoader<'info, Vault>,
    /// CHECK: Seeds validated in CPI to DriftVaults program
    #[account(mut)]
    pub investor: AccountLoader<'info, VaultDepositor>,
    /// CHECK: Seeds validated in CPI to DriftVaults program
    #[account(mut)]
    pub drift_user_stats: AccountInfo<'info>,
    #[account(mut)]
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
