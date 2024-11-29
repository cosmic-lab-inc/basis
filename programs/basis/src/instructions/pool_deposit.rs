use crate::constraints::*;
use crate::cpis::*;
use crate::state::Pool;
use crate::{declare_pool_payer_seeds, declare_pool_seeds};
use anchor_lang::prelude::*;
use anchor_spl::token::{mint_to, transfer, Mint, MintTo};
use anchor_spl::token::{Token, TokenAccount, Transfer};
use drift::program::Drift;
use drift::state::user::User;
use drift_vaults::cpi::accounts::Deposit;
use drift_vaults::program::DriftVaults;
use drift_vaults::state::{Vault, VaultDepositor};

pub fn pool_deposit<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, PoolDeposit<'info>>,
    params: PoolDepositParams,
) -> Result<()> {
    ctx.token_transfer(params.usdc)?;
    ctx.deposit(params.usdc)?;
    ctx.mint(params.usdc)?;

    let mut pool = ctx.accounts.pool.load_mut()?;
    pool.deposit(params.usdc)?;

    Ok(())
}

#[derive(Debug, Clone, Copy, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub struct PoolDepositParams {
    pub usdc: u64,
}

#[derive(Accounts)]
#[instruction(params: PoolDepositParams)]
pub struct PoolDeposit<'info> {
    #[account(mut)]
    pub vault: AccountLoader<'info, Vault>,
    /// CHECK: Seeds validated in CPI to DriftVaults program
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

    pub pool_depositor: Signer<'info>,
    #[account(
        mut,
        token::authority = pool_depositor.key(),
        token::mint = vault_token_account.mint
    )]
    pub pool_depositor_usdc_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        token::authority = pool_depositor.key(),
        token::mint = basis_mint.key()
    )]
    pub pool_depositor_basis_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = is_basis_mint(&pool, &basis_mint)?
    )]
    pub basis_mint: Box<Account<'info, Mint>>,

    /// Authority of [`Pool`]
    pub authority: Signer<'info>,
    #[account(
        mut,
        constraint = is_authority_for_pool(&pool, &authority)?,
    )]
    pub pool: AccountLoader<'info, Pool>,
    /// PDA signer that pays for transaction fees
    #[account(
        mut,
        seeds = [b"pool_payer", pool.key().as_ref()],
        bump,
    )]
    pub pool_payer: SystemAccount<'info>,
    #[account(
        mut,
        token::authority = pool_payer,
        token::mint = vault_token_account.mint
    )]
    pub pool_payer_usdc_token_account: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub drift_vaults_program: Program<'info, DriftVaults>,
    pub drift_program: Program<'info, Drift>,
    pub token_program: Program<'info, Token>,
}

impl<'info> TokenTransfer for Context<'_, '_, '_, 'info, PoolDeposit<'info>> {
    fn token_transfer(&self, amount: u64) -> Result<()> {
        declare_pool_payer_seeds!(self.accounts.pool, self.bumps.pool_payer, seeds);
        let transfer_cpi_accounts = Transfer {
            from: self
                .accounts
                .pool_depositor_usdc_token_account
                .to_account_info()
                .clone(),
            to: self
                .accounts
                .pool_payer_usdc_token_account
                .to_account_info()
                .clone(),
            authority: self.accounts.pool_depositor.to_account_info().clone(),
        };
        let token_program = self.accounts.token_program.to_account_info().clone();
        let cpi_context = CpiContext::new_with_signer(token_program, transfer_cpi_accounts, seeds);
        transfer(cpi_context, amount)?;
        msg!(
            "transferred {} USDC from pool depositor to pool payer",
            amount
        );
        Ok(())
    }
}

impl<'info> DriftVaultsDeposit for Context<'_, '_, '_, 'info, PoolDeposit<'info>> {
    fn deposit(&self, usdc: u64) -> Result<()> {
        declare_pool_payer_seeds!(self.accounts.pool, self.bumps.pool_payer, seeds);
        let rem_accts = self.remaining_accounts.to_vec();
        let cpi_program = self.accounts.drift_vaults_program.to_account_info().clone();
        let cpi_accounts = Deposit {
            vault: self.accounts.vault.to_account_info(),
            vault_depositor: self.accounts.investor.to_account_info(),
            authority: self.accounts.pool_payer.to_account_info(),
            vault_token_account: self.accounts.vault_token_account.to_account_info(),
            drift_user_stats: self.accounts.drift_user_stats.to_account_info(),
            drift_user: self.accounts.drift_user.to_account_info(),
            drift_state: self.accounts.drift_state.to_account_info(),
            drift_spot_market_vault: self.accounts.drift_spot_market_vault.to_account_info(),
            user_token_account: self
                .accounts
                .pool_payer_usdc_token_account
                .to_account_info(),
            drift_program: self.accounts.drift_program.to_account_info(),
            token_program: self.accounts.token_program.to_account_info(),
        };
        let cpi_context = CpiContext::new_with_signer(cpi_program, cpi_accounts, seeds)
            .with_remaining_accounts(rem_accts);
        drift_vaults::cpi::deposit(cpi_context, usdc)
    }
}

impl<'info> MintBasis for Context<'_, '_, '_, 'info, PoolDeposit<'info>> {
    fn mint(&self, amount: u64) -> Result<()> {
        declare_pool_seeds!(self.accounts.pool, seeds);
        let mint_to_cpi_accounts = MintTo {
            mint: self.accounts.basis_mint.to_account_info().clone(),
            to: self
                .accounts
                .pool_depositor_basis_token_account
                .to_account_info()
                .clone(),
            authority: self.accounts.pool.to_account_info().clone(),
        };
        let token_program = self.accounts.token_program.to_account_info().clone();
        let cpi_context = CpiContext::new_with_signer(token_program, mint_to_cpi_accounts, seeds);
        mint_to(cpi_context, amount)?;
        msg!("minted {} BASIS to pool depositor", amount);

        Ok(())
    }
}
