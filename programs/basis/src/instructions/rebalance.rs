use crate::constraints::*;
use crate::cpis::DriftVaultsInitializeInvestor;
use crate::declare_pool_payer_seeds;
use crate::state::{Investment, Pool};
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use drift_vaults::cpi::accounts::InitializeVaultDepositor;
use drift_vaults::program::DriftVaults;
use drift_vaults::state::{Size, Vault, VaultDepositor};

pub fn rebalance<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, Rebalance<'info>>,
) -> Result<()> {
    let investment = Investment {
        investor: ctx.accounts.investor.key(),
        init_ts: Clock::get()?.unix_timestamp,
        ..Default::default()
    };
    ctx.initialize_investor()?;
    let mut pool = ctx.accounts.pool.load_mut()?;
    pool.add_investment(investment)?;

    Ok(())
}

#[derive(Accounts)]
pub struct Rebalance<'info> {
    pub vault: AccountLoader<'info, Vault>,

    #[account(
        mut,
        constraint = is_investment_for_pool(&pool, &investor)?
    )]
    pub investor: AccountLoader<'info, VaultDepositor>,

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

    #[account(mut)]
    pub payer: Signer<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub drift_vaults_program: Program<'info, DriftVaults>,
}

impl<'info> DriftVaultsInitializeInvestor for Context<'_, '_, '_, 'info, Rebalance<'info>> {
    fn initialize_investor(&self) -> Result<()> {
        // transfer lamports from authority to pool, so it can pay for CPI
        let system_program = self.accounts.system_program.to_account_info();
        let transfer_cpi_accounts = Transfer {
            from: self.accounts.authority.to_account_info(),
            to: self.accounts.pool_payer.to_account_info(),
        };
        let lamports = Rent::default().minimum_balance(VaultDepositor::SIZE);
        let transfer_cpi_context = CpiContext::new(system_program, transfer_cpi_accounts);
        transfer(transfer_cpi_context, lamports)?;
        msg!("pool_payer funded with lamports: {}", lamports);

        declare_pool_payer_seeds!(self.accounts.pool, self.bumps.pool_payer, seeds);
        let cpi_program = self.accounts.drift_vaults_program.to_account_info().clone();
        let cpi_accounts = InitializeVaultDepositor {
            vault: self.accounts.vault.to_account_info(),
            vault_depositor: self.accounts.investor.to_account_info(),
            authority: self.accounts.pool_payer.to_account_info(),
            payer: self.accounts.pool_payer.to_account_info(),
            rent: self.accounts.rent.to_account_info(),
            system_program: self.accounts.system_program.to_account_info(),
        };
        let cpi_context = CpiContext::new_with_signer(cpi_program, cpi_accounts, seeds);
        drift_vaults::cpi::initialize_vault_depositor(cpi_context)
    }
}
