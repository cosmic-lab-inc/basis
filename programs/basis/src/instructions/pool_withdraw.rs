use crate::constraints::*;
use crate::cpis::*;
use crate::declare_pool_seeds;
use crate::math::SafeMath;
use crate::state::Pool;
use anchor_lang::prelude::*;
use anchor_spl::token::{burn, transfer, Burn, Mint};
use anchor_spl::token::{Token, TokenAccount, Transfer};
use drift_vaults::state::VaultDepositor;

pub fn pool_withdraw<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, PoolWithdraw<'info>>,
    params: PoolWithdrawParams,
) -> Result<()> {
    let mut pool = ctx.accounts.pool.load_mut()?;
    let investor = ctx.accounts.investor.load()?;
    let usdc_to_issue = pool.withdraw(params.basis, &investor)?.safe_sub(1)?;
    drop(pool);
    drop(investor);
    msg!("USDC to issue: {}", usdc_to_issue);
    let pool_usdc = ctx.accounts.pool_usdc_token_account.amount;
    msg!("pool usdc: {}", pool_usdc);

    ctx.token_transfer(usdc_to_issue)?;
    ctx.burn(params.basis)?;

    Ok(())
}

#[derive(Debug, Clone, Copy, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub struct PoolWithdrawParams {
    pub basis: u64,
}

#[derive(Accounts)]
#[instruction(params: PoolWithdrawParams)]
pub struct PoolWithdraw<'info> {
    #[account(
        mut,
        constraint = is_investment_for_pool(&pool, &investor)?
    )]
    pub investor: AccountLoader<'info, VaultDepositor>,

    #[account(mut)]
    pub pool_depositor: Signer<'info>,
    #[account(
        mut,
        token::authority = pool_depositor.key(),
        token::mint = pool.load()?.usdc_mint
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
        mint::authority = pool,
        constraint = is_basis_mint(&pool, &basis_mint)?
    )]
    pub basis_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
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
        token::authority = pool,
        token::mint = pool.load()?.usdc_mint,
        constraint = is_pool_usdc_vault(&pool, &pool_usdc_token_account)?
    )]
    pub pool_usdc_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

impl<'info> TokenTransfer for Context<'_, '_, '_, 'info, PoolWithdraw<'info>> {
    fn token_transfer(&self, amount: u64) -> Result<()> {
        declare_pool_seeds!(self.accounts.pool, seeds);
        let transfer_cpi_accounts = Transfer {
            from: self
                .accounts
                .pool_usdc_token_account
                .to_account_info()
                .clone(),
            to: self
                .accounts
                .pool_depositor_usdc_token_account
                .to_account_info()
                .clone(),
            authority: self.accounts.pool.to_account_info().clone(),
        };
        let token_program = self.accounts.token_program.to_account_info().clone();
        let cpi_context = CpiContext::new_with_signer(token_program, transfer_cpi_accounts, seeds);
        transfer(cpi_context, amount)?;
        msg!("transferred {} USDC from pool to pool depositor", amount);
        Ok(())
    }
}

impl<'info> BurnBasis for Context<'_, '_, '_, 'info, PoolWithdraw<'info>> {
    fn burn(&self, amount: u64) -> Result<()> {
        declare_pool_seeds!(self.accounts.pool, seeds);
        let burn_cpi_accounts = Burn {
            mint: self.accounts.basis_mint.to_account_info().clone(),
            from: self
                .accounts
                .pool_depositor_basis_token_account
                .to_account_info()
                .clone(),
            authority: self.accounts.pool_depositor.to_account_info().clone(),
        };
        let token_program = self.accounts.token_program.to_account_info().clone();
        let cpi_context = CpiContext::new_with_signer(token_program, burn_cpi_accounts, seeds);
        burn(cpi_context, amount)?;
        msg!("burned {} BASIS from pool depositor", amount);
        Ok(())
    }
}
