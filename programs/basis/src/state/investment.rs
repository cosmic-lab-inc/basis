use crate::constants::PERCENTAGE_PRECISION;
use crate::error::PoolResult;
use crate::math::{Cast, SafeMath};
use crate::state::Size;
use anchor_lang::prelude::*;
use drift::math::insurance::if_shares_to_vault_amount as shares_to_amount;
use drift_vaults::state::{Vault, VaultDepositor, VaultDepositorBase, VaultProtocol};
use static_assertions::const_assert_eq;
use std::cell::RefMut;

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

    pub fn investment_equity(
        vault_equity: u64,
        vault: &Vault,
        investor: &VaultDepositor,
    ) -> Result<u64> {
        let equity = shares_to_amount(
            investor.get_vault_shares(),
            vault.total_shares,
            vault_equity,
        )?;
        Ok(equity)
    }

    pub fn investment_withdraw_request_equity(
        vault_equity: u64,
        vault: &Vault,
        investor: &VaultDepositor,
    ) -> Result<u64> {
        let equity = shares_to_amount(
            investor.last_withdraw_request.shares,
            vault.total_shares,
            vault_equity,
        )?;
        Ok(equity.min(investor.last_withdraw_request.value))
    }

    pub fn investment_profit(investor_equity: u64, investor: &VaultDepositor) -> Result<i64> {
        let profit = investor_equity.cast::<i64>()?.safe_sub(
            investor
                .net_deposits
                .safe_add(investor.cumulative_profit_share_amount)?,
        )?;
        Ok(profit)
    }

    pub fn investment_equity_with_profit_share(
        vault_equity: u64,
        investor: &VaultDepositor,
        vault: &Vault,
        vault_protocol: &mut Option<RefMut<VaultProtocol>>,
    ) -> Result<InvestmentEquity> {
        let investor_equity = Investment::investment_equity(vault_equity, vault, investor)?;
        let profit = Investment::investment_profit(investor_equity, investor)?;
        if profit > 0 {
            let profit_u128 = profit.cast::<u128>()?;

            let manager_profit_share_amount = profit_u128
                .safe_mul(vault.profit_share.cast()?)?
                .safe_div(PERCENTAGE_PRECISION)?;
            let protocol_profit_share_amount = match vault_protocol {
                None => 0,
                Some(vp) => profit_u128
                    .safe_mul(vp.protocol_profit_share.cast()?)?
                    .safe_div(PERCENTAGE_PRECISION)?,
            };
            let total_profit_share_amount =
                manager_profit_share_amount.safe_add(protocol_profit_share_amount)?;
            return Ok(InvestmentEquity {
                profit_share: total_profit_share_amount.cast()?,
                equity_after_profit_share: investor_equity
                    .safe_sub(total_profit_share_amount.cast()?)?,
                equity: investor_equity,
                equity_without_profit: investor_equity.safe_sub(profit.cast()?)?,
                profit,
                profit_after_share: profit.safe_sub(total_profit_share_amount.cast()?)?,
                deposits: investor.net_deposits,
            });
        }
        Ok(InvestmentEquity {
            profit_share: 0,
            equity_after_profit_share: investor_equity,
            equity: investor_equity,
            equity_without_profit: investor_equity,
            profit,
            profit_after_share: profit,
            deposits: investor.net_deposits,
        })
    }
}

#[derive(Debug, Default)]
pub struct InvestmentEquity {
    pub profit_share: u64,
    pub profit_after_share: i64,
    pub equity_after_profit_share: u64,
    pub equity_without_profit: u64,
    pub equity: u64,
    pub profit: i64,
    pub deposits: i64,
}
