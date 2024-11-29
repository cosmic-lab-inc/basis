use crate::constraints::*;
use crate::cpis::DriftInitializeInvestor;
use crate::state::{Investment, Pool};
use crate::{declare_pool_payer_seeds, declare_pool_seeds};
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use drift_vaults::cpi::accounts::InitializeVaultDepositor;
use drift_vaults::program::DriftVaults;
use drift_vaults::state::{Size, Vault, VaultDepositor};

pub fn add_investment<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, AddInvestment<'info>>,
    params: AddInvestmentParams,
) -> Result<()> {
    let investment = Investment {
        investor: ctx.accounts.investor.key(),
        init_ts: Clock::get()?.unix_timestamp,
        weight: params.weight,
        ..Default::default()
    };

    ctx.initialize_investor()?;

    let mut pool = ctx.accounts.pool.load_mut()?;
    pool.add_investment(investment)?;

    // todo: rebalance pool

    Ok(())
}

#[derive(Debug, Clone, Copy, AnchorSerialize, AnchorDeserialize, PartialEq, Eq)]
pub struct AddInvestmentParams {
    pub weight: u32,
}

#[derive(Accounts)]
#[instruction(params: AddInvestmentParams)]
pub struct AddInvestment<'info> {
    pub vault: AccountLoader<'info, Vault>,

    /// CHECK: Validated as [`VaultDepositor`] with appropriate seeds in CPI to DriftVaults program
    #[account(mut)]
    pub investor: AccountInfo<'info>,

    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = is_authority_for_pool(&pool, &authority)?,
    )]
    pub pool: AccountLoader<'info, Pool>,

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

impl<'info> DriftInitializeInvestor for Context<'_, '_, '_, 'info, AddInvestment<'info>> {
    fn initialize_investor(&self) -> Result<()> {
        // transfer lamports from authority to pool, so it can pay for CPI
        let system_program = self.accounts.system_program.to_account_info();
        let transfer_cpi_accounts = Transfer {
            from: self.accounts.authority.to_account_info(),
            to: self.accounts.pool_payer.to_account_info(),
        };
        let vault_depositor_rent = Rent::default().minimum_balance(VaultDepositor::SIZE);
        let transfer_cpi_context = CpiContext::new(system_program, transfer_cpi_accounts);
        transfer(transfer_cpi_context, vault_depositor_rent)?;
        msg!("pool_payer funded with lamports: {}", vault_depositor_rent);

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
