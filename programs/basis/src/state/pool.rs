use crate::error::{ErrorCode, PoolResult};
use crate::state::FundTracker;
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
    /// Authority who can sign to modify this account
    pub authority: Pubkey,
    /// To prevent breaching the maximum remaining accounts per instruction of 32,
    /// the number of funds is limited to 16.
    pub funds: [FundTracker; 16],
    /// Total USDC deposits in the pool which backs the BASIS token
    pub deposits: u128,
    /// Outstanding supply of the BASIS token
    pub supply: u128,
    /// Exchange rate of BASIS/USDC
    pub exchange_rate: u128,
    /// Last time yield was distributed from each [`FundTracker`]
    pub last_distribution_ts: u64,
    /// Last time the [`FundTracker`] weights were rebalanced
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
}

impl Size for Pool {
    const SIZE: usize = (32 * 4) + (FundTracker::SIZE * 16) + (16 * 3) + (8 * 3) + (1 + 7) + 8;
}
const_assert_eq!(Pool::SIZE, std::mem::size_of::<Pool>() + 8);

impl Pool {
    pub fn add_fund(&mut self, fund_tracker: FundTracker) -> PoolResult<usize> {
        let new_fund_index = self
            .funds
            .iter()
            .enumerate()
            .position(|(index, fund)| fund.is_empty())
            .ok_or(ErrorCode::NoFundTrackersAvailable)?;
        self.funds[new_fund_index] = fund_tracker;
        Ok(new_fund_index)
    }

    pub fn remove_fund(&mut self, fund_index: usize) -> PoolResult<usize> {
        let existing_fund = self
            .funds
            .get(fund_index)
            .ok_or(FundTracker::default())
            .map_err(|_| ErrorCode::FundTrackerNotFound)?;
        if existing_fund.is_empty() {
            Err(ErrorCode::FundTrackerNotFound.into())
        } else {
            self.funds[fund_index] = FundTracker::default();
            Ok(fund_index)
        }
    }
}
