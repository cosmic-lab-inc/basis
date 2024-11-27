use crate::Size;
use anchor_lang::prelude::*;
use drift_macros::assert_no_slop;
use static_assertions::const_assert_eq;

#[assert_no_slop]
#[account(zero_copy(unsafe))]
#[derive(Default, Eq, PartialEq, Debug)]
#[repr(C)]
pub struct FundTracker {
    /// The PDA of this account
    pub pubkey: Pubkey,
    /// The pool that has an allocation/weight to this fund
    pub pool: Pubkey,
    /// Mint of fund's tokenized shares
    pub mint: Pubkey,
    /// Authority is the [`FundTracker`] PDA, mint is this [`FundTracker.mint`] (the previous field)
    pub token: Pubkey,
    /// Authority who can sign to modify this account
    pub authority: Pubkey,
    /// Time this account was initialized
    pub init_ts: i64,
    /// Basis points of the fund's weight in the pool (10_000 = 100%, 1 = 0.01%)
    pub weight: u32,
    pub bump: u8,
    pub padding: [u8; 3],
}

impl FundTracker {
    pub fn get_fund_tracker_signer_seeds<'a>(
        pool: &'a [u8],
        fund_mint: &'a [u8],
        bump: &'a u8,
    ) -> [&'a [u8]; 4] {
        [
            b"fund_tracker".as_ref(),
            pool,
            fund_mint,
            bytemuck::bytes_of(bump),
        ]
    }
}

impl Size for FundTracker {
    const SIZE: usize = 32 * 5 + 8 + 4 + 1 + 3 + 8;
}
const_assert_eq!(FundTracker::SIZE, std::mem::size_of::<FundTracker>() + 8);
