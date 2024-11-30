use crate::constants::QUOTE_PRECISION;
use crate::error::{ErrorCode, PoolResult};
use crate::math::{Cast, SafeMath};
use crate::state::Investment;
use crate::Size;
use anchor_lang::prelude::*;
use drift_macros::assert_no_slop;
use static_assertions::const_assert_eq;

#[assert_no_slop]
#[account(zero_copy(unsafe))]
#[derive(Default, Eq, PartialEq, Debug)]
#[repr(C)]
pub struct Pool {
    /// The PDA of this account
    pub pubkey: Pubkey,
    /// Mint of the yield-bearing token backed by this pool: BASIS
    pub basis_mint: Pubkey,
    /// USDC mint with which the yield-bearing token is burned/exchanged for, and which deposits are made in
    pub usdc_mint: Pubkey,
    /// Token account to receive USDC when removing a fund, distributing yield, or rebalancing
    pub usdc_vault: Pubkey,
    /// Authority who can sign to modify this account
    pub authority: Pubkey,
    /// To prevent breaching the maximum remaining accounts per instruction of 32,
    /// the number of funds is limited to 16.
    pub investments: [Investment; 16],
    /// Total USDC deposits in the pool which backs the BASIS token
    pub deposits: u128,
    /// Outstanding supply of the BASIS token
    pub supply: u128,
    /// Exchange rate of BASIS/USDC
    pub exchange_rate: u128,
    /// Last time yield was distributed from each [`Investment`]
    pub last_distribution_ts: u64,
    /// Last time the [`Investment`] weights were rebalanced
    pub last_rebalance_ts: u64,
    /// Time this account was initialized
    pub init_ts: i64,
    pub bump: u8,
    pub padding: [u8; 7],
}

impl Pool {
    pub fn get_pool_signer_seeds<'a>(basis_mint: &'a [u8], bump: &'a u8) -> [&'a [u8]; 3] {
        [b"pool".as_ref(), basis_mint, bytemuck::bytes_of(bump)]
    }
    pub fn get_pool_payer_signer_seeds<'a>(pool: &'a [u8], bump: &'a u8) -> [&'a [u8]; 3] {
        [b"pool_payer".as_ref(), pool, bytemuck::bytes_of(bump)]
    }
}

impl Size for Pool {
    const SIZE: usize = (32 * 5) + (Investment::SIZE * 16) + (16 * 3) + (8 * 3) + (1 + 7) + 8;
}
const_assert_eq!(Pool::SIZE, std::mem::size_of::<Pool>() + 8);

impl Pool {
    pub fn add_investment(&mut self, investment: Investment) -> PoolResult<usize> {
        let new_investment_index = self
            .investments
            .iter()
            .position(|investment| investment.is_empty())
            .ok_or(ErrorCode::NoInvestmentsAvailable)?;
        self.investments[new_investment_index] = investment;
        Ok(new_investment_index)
    }

    pub fn remove_investment(&mut self, index: usize) -> PoolResult<usize> {
        let existing_investment = self
            .investments
            .get(index)
            .ok_or(Investment::default())
            .map_err(|_| ErrorCode::InvestmentNotFound)?;
        if existing_investment.is_empty() {
            Err(ErrorCode::InvestmentNotFound)
        } else {
            self.investments[index] = Investment::default();
            Ok(index)
        }
    }

    pub fn deposit(&mut self, amount: u64) -> PoolResult<()> {
        self.deposits = self.deposits.safe_add(amount.cast()?)?;
        self.supply = self.supply.safe_add(amount.cast()?)?;
        self.exchange_rate = self
            .deposits
            .safe_mul(QUOTE_PRECISION)?
            .safe_div(self.supply)?;
        Ok(())
    }

    pub fn distribute_yield(&mut self, amount: u64) -> PoolResult<()> {
        self.deposits = self.deposits.safe_add(amount.cast()?)?;
        self.exchange_rate = self
            .deposits
            .safe_mul(QUOTE_PRECISION)?
            .safe_div(self.supply)?;
        Ok(())
    }
}
