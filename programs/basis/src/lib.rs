mod constants;
mod cpis;
mod error;
mod instructions;
pub mod macros;
mod math;
mod state;

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

    pub fn add_fund<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, AddFund<'info>>,
        params: AddFundParams,
    ) -> Result<()> {
        instructions::add_fund(ctx, params)
    }
}
