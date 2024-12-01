mod constants;
mod cpis;
mod error;
mod instructions;
pub mod macros;
mod math;
mod state;
mod tests;
mod venue;

use anchor_lang::prelude::*;
use instructions::*;
use state::*;

declare_id!("Basis9pRdq5cFHdnML4asQE8oFjRWX7qbL9H5boN91x");

#[program]
pub mod basis {
    use super::*;

    pub fn initialize_pool<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, InitializePool<'info>>,
    ) -> Result<()> {
        instructions::initialize_pool(ctx)
    }

    pub fn add_investment<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, AddInvestment<'info>>,
        params: AddInvestmentParams,
    ) -> Result<()> {
        instructions::add_investment(ctx, params)
    }

    pub fn remove_investment<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, RemoveInvestment<'info>>,
        params: RemoveInvestmentParams,
    ) -> Result<()> {
        instructions::remove_investment(ctx, params)
    }

    pub fn pool_deposit<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, PoolDeposit<'info>>,
        params: PoolDepositParams,
    ) -> Result<()> {
        instructions::pool_deposit(ctx, params)
    }

    pub fn request_vault_withdraw<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, RequestVaultWithdraw<'info>>,
        params: RequestVaultWithdrawParams,
    ) -> Result<()> {
        instructions::request_vault_withdraw(ctx, params)
    }

    pub fn vault_withdraw<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, VaultWithdraw<'info>>,
    ) -> Result<()> {
        instructions::vault_withdraw(ctx)
    }

    pub fn pool_withdraw<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, PoolWithdraw<'info>>,
        params: PoolWithdrawParams,
    ) -> Result<()> {
        instructions::pool_withdraw(ctx, params)
    }

    pub fn request_distribute_yield<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, RequestDistributeYield<'info>>,
    ) -> Result<()> {
        instructions::request_distribute_yield(ctx)
    }

    pub fn distribute_yield<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, DistributeYield<'info>>,
    ) -> Result<()> {
        instructions::distribute_yield(ctx)
    }
}
