use crate::constraints::*;
use crate::cpis::{DriftVaultsWithdraw, TokenTransfer};
use crate::declare_pool_payer_seeds;
use crate::state::{Investment, Pool};
use anchor_lang::prelude::*;
use anchor_spl::token::{transfer, Token, TokenAccount, Transfer};
use drift::instructions::optional_accounts::AccountMaps;
use drift::program::Drift;
use drift::state::user::User;
use drift_vaults::cpi::accounts::Withdraw;
use drift_vaults::program::DriftVaults;
use drift_vaults::state::{AccountMapProvider, Vault, VaultDepositor, VaultProtocolProvider};

pub fn vault_withdraw<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, VaultWithdraw<'info>>,
) -> Result<()> {
    let clock = &Clock::get()?;
    let vault = ctx.accounts.vault.load_mut()?;
    // backwards compatible: if last rem acct does not deserialize into [`VaultProtocol`] then it's a legacy vault.
    let mut vp = ctx.vault_protocol();
    vault.validate_vault_protocol(&vp)?;
    let vp = vp.as_mut().map(|vp| vp.load_mut()).transpose()?;
    let user = ctx.accounts.drift_user.load()?;
    let spot_market_index = vault.spot_market_index;
    let investor = ctx.accounts.investor.load()?;

    let AccountMaps {
        perp_market_map,
        spot_market_map,
        mut oracle_map,
    } = ctx.load_maps(clock.slot, Some(spot_market_index), vp.is_some())?;
    let vault_equity =
        vault.calculate_equity(&user, &perp_market_map, &spot_market_map, &mut oracle_map)?;

    let usdc_to_distribute = Investment::withdraw_request_equity(vault_equity, &vault, &investor)?;

    msg!("USDC in vault: {}", vault_equity);

    msg!("{} USDC to withdraw from vault to pool", usdc_to_distribute);
    drop(vault);
    drop(investor);
    drop(user);
    drop(vp);

    ctx.withdraw()?;
    ctx.token_transfer(usdc_to_distribute)?;

    Ok(())
}

#[derive(Accounts)]
pub struct VaultWithdraw<'info> {
    #[account(mut)]
    pub vault: AccountLoader<'info, Vault>,
    #[account(mut)]
    pub investor: AccountLoader<'info, VaultDepositor>,
    #[account(mut)]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: Seeds validated in CPI to DriftVaults program
    #[account(mut)]
    pub drift_user_stats: AccountInfo<'info>,
    #[account(mut)]
    pub drift_user: AccountLoader<'info, User>,
    /// CHECK: Seeds validated in CPI to DriftVaults program
    pub drift_state: AccountInfo<'info>,
    #[account(mut)]
    pub drift_spot_market_vault: Box<Account<'info, TokenAccount>>,
    /// CHECK: checked in drift cpi
    pub drift_signer: AccountInfo<'info>,
    pub drift_vaults_program: Program<'info, DriftVaults>,
    pub drift_program: Program<'info, Drift>,

    #[account(
        mut,
        constraint = is_pool_usdc_vault(&pool, &pool_usdc_token_account)?,
    )]
    pub pool_usdc_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub pool: AccountLoader<'info, Pool>,

    #[account(
        mut,
        token::authority = pool_payer,
        token::mint = vault_token_account.mint,
    )]
    pub pool_payer_usdc_token_account: Box<Account<'info, TokenAccount>>,
    /// PDA signer that pays for transaction fees
    #[account(
        mut,
        seeds = [b"pool_payer", pool.key().as_ref()],
        bump,
    )]
    pub pool_payer: SystemAccount<'info>,

    pub token_program: Program<'info, Token>,
}

impl<'info> DriftVaultsWithdraw for Context<'_, '_, '_, 'info, VaultWithdraw<'info>> {
    fn withdraw(&self) -> Result<()> {
        declare_pool_payer_seeds!(self.accounts.pool, self.bumps.pool_payer, seeds);
        let rem_accts = self.remaining_accounts.to_vec();
        let cpi_program = self.accounts.drift_vaults_program.to_account_info().clone();
        let cpi_accounts = Withdraw {
            vault: self.accounts.vault.to_account_info(),
            vault_depositor: self.accounts.investor.to_account_info(),
            authority: self.accounts.pool_payer.to_account_info(),
            vault_token_account: self.accounts.vault_token_account.to_account_info(),
            drift_user_stats: self.accounts.drift_user_stats.to_account_info(),
            drift_user: self.accounts.drift_user.to_account_info(),
            drift_state: self.accounts.drift_state.to_account_info(),
            drift_spot_market_vault: self.accounts.drift_spot_market_vault.to_account_info(),
            drift_signer: self.accounts.drift_signer.to_account_info(),
            user_token_account: self
                .accounts
                .pool_payer_usdc_token_account
                .to_account_info(),
            drift_program: self.accounts.drift_program.to_account_info(),
            token_program: self.accounts.token_program.to_account_info(),
        };
        let cpi_context = CpiContext::new_with_signer(cpi_program, cpi_accounts, seeds)
            .with_remaining_accounts(rem_accts);
        drift_vaults::cpi::withdraw(cpi_context)
    }
}

impl<'info> TokenTransfer for Context<'_, '_, '_, 'info, VaultWithdraw<'info>> {
    fn token_transfer(&self, usdc: u64) -> Result<()> {
        declare_pool_payer_seeds!(self.accounts.pool, self.bumps.pool_payer, seeds);
        let transfer_cpi_accounts = Transfer {
            from: self
                .accounts
                .pool_payer_usdc_token_account
                .to_account_info()
                .clone(),
            to: self
                .accounts
                .pool_usdc_token_account
                .to_account_info()
                .clone(),
            authority: self.accounts.pool_payer.to_account_info().clone(),
        };
        let token_program = self.accounts.token_program.to_account_info().clone();
        let cpi_context = CpiContext::new_with_signer(token_program, transfer_cpi_accounts, seeds);
        transfer(cpi_context, usdc)?;
        Ok(())
    }
}
