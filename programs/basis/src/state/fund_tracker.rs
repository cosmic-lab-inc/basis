use crate::error::ErrorCode;
use crate::state::Size;
use anchor_lang::prelude::*;
use static_assertions::const_assert_eq;

#[zero_copy(unsafe)]
#[derive(Default, Eq, PartialEq, Debug)]
#[repr(C)]
pub struct FundTracker {
    /// Mint of fund's tokenized shares
    pub mint: Pubkey,
    /// Authority is [`Pool`] PDA, mint is [`FundTracker.mint`]
    pub token: Pubkey,
    /// Time this account was initialized
    pub init_ts: i64,
    /// Basis points of the fund's weight in the pool (10_000 = 100%, 1 = 0.01%)
    pub weight: u32,
    pub padding: [u8; 4],
}

impl Size for FundTracker {
    const SIZE: usize = 32 * 2 + 8 + 4 + 4;
}
const_assert_eq!(FundTracker::SIZE, std::mem::size_of::<FundTracker>());

impl FundTracker {
    pub fn is_empty(self) -> bool {
        self.mint == Pubkey::default()
            && self.token == Pubkey::default()
            && self.init_ts == 0
            && self.weight == 0
    }
}
