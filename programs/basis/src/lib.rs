mod constants;
mod cpis;
mod error;
mod instructions;
pub mod macros;
mod math;
mod state;
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
}
