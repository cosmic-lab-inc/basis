use crate::state::Size;
use anchor_lang::prelude::*;
use static_assertions::const_assert_eq;

#[zero_copy(unsafe)]
#[derive(Default, Eq, PartialEq, Debug)]
#[repr(C)]
pub struct Investment {
    /// PDA of [`VaultDepositor`] account which owns shares in a [`Vault`]
    pub investor: Pubkey,
    /// Total USDC profit distributed to the pool by this investment
    /// This is USDC (6 decimals) multiplied by QUOTE_PRECISION which is also 10^6
    pub total_profit: u128,
    /// Time this investment was initialized
    pub init_ts: i64,
    /// Basis points of the investment's weight in the pool (10_000 = 100%, 1 = 0.01%)
    /// This is used during rebalancing to determine how much of the pool's funds to allocate to this investment
    pub weight: u32,
    pub padding: [u8; 4],
}

impl Size for Investment {
    const SIZE: usize = 32 + 16 + 8 + 4 + 4;
}
const_assert_eq!(Investment::SIZE, std::mem::size_of::<Investment>());

impl Investment {
    pub fn is_empty(self) -> bool {
        self.investor == Pubkey::default() && self.init_ts == 0 && self.weight == 0
    }
}
