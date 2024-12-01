use crate::constraints::*;
use crate::cpis::*;
use crate::error::ErrorCode;
use crate::math::{Cast, SafeMath};
use crate::state::{Investment, InvestmentEquity, Pool};
use crate::{declare_pool_payer_seeds, validate};
use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;
use drift::instructions::optional_accounts::AccountMaps;
use drift::state::user::User;
use drift_vaults::cpi::accounts::RequestWithdraw;
use drift_vaults::program::DriftVaults;
use drift_vaults::state::{
    AccountMapProvider, Vault, VaultDepositor, VaultProtocolProvider, WithdrawUnit,
};

pub fn request_vault_withdraw<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, RequestVaultWithdraw<'info>>,
    params: RequestVaultWithdrawParams,
) -> Result<()> {
    let clock = &Clock::get()?;
    let vault = ctx.accounts.vault.load()?;
    let investor = ctx.accounts.investor.load()?;

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

    let InvestmentEquity { equity, .. } =
        Investment::equity_breakdown(vault_equity, &investor, &vault, &mut vp)?;

    msg!("USDC in vault: {}", vault_equity);
    msg!("investor USDC in vault: {}", equity);

    validate!(
        ctx.accounts.pool_depositor_basis_token_account.amount >= params.basis,
        ErrorCode::InsufficientBasisTokens,
        "Insufficient BASIS tokens in pool depositor token account ({} < {})",
        ctx.accounts.pool_depositor_basis_token_account.amount,
        params.basis
    )?;
    let pool = ctx.accounts.pool.load()?;
    let usdc_to_issue = pool.basis_to_usdc(params.basis)?.cast::<u64>()?;
    msg!("USDC to issue: {}", usdc_to_issue);
    let pool_usdc = ctx.accounts.pool_usdc_token_account.amount;
    msg!("USDC in pool: {}", pool_usdc);
    let usdc_to_request = usdc_to_issue.safe_sub(pool_usdc)?;
    msg!("USDC to request: {}", usdc_to_request);

    drop(pool);
    drop(vault);
    drop(vp);
    drop(user);
    drop(investor);

    ctx.request_withdraw(usdc_to_request)?;
    Ok(())
}

#[derive(Debug, Clone, Copy, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub struct RequestVaultWithdrawParams {
    pub basis: u64,
}

#[derive(Accounts)]
#[instruction(params: RequestVaultWithdrawParams)]
pub struct RequestVaultWithdraw<'info> {
    #[account(mut)]
    pub vault: AccountLoader<'info, Vault>,
    #[account(mut)]
    pub investor: AccountLoader<'info, VaultDepositor>,
    /// CHECK: Seeds validated in CPI to DriftVaults program
    pub drift_user_stats: AccountInfo<'info>,
    pub drift_user: AccountLoader<'info, User>,
    /// CHECK: Seeds validated in CPI to DriftVaults program
    pub drift_state: AccountInfo<'info>,
    pub drift_vaults_program: Program<'info, DriftVaults>,

    #[account(mut)]
    pub pool_depositor: Signer<'info>,
    #[account(
        token::authority = pool_depositor.key(),
        token::mint = pool.load()?.basis_mint
    )]
    pub pool_depositor_basis_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        token::authority = pool,
        token::mint = pool.load()?.usdc_mint,
        constraint = is_pool_usdc_vault(&pool, &pool_usdc_token_account)?
    )]
    pub pool_usdc_token_account: Box<Account<'info, TokenAccount>>,
    pub pool: AccountLoader<'info, Pool>,
    /// PDA signer that pays for transaction fees
    #[account(
        seeds = [b"pool_payer", pool.key().as_ref()],
        bump,
    )]
    pub pool_payer: SystemAccount<'info>,
}

impl<'info> DriftVaultsRequestWithdraw for Context<'_, '_, '_, 'info, RequestVaultWithdraw<'info>> {
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
