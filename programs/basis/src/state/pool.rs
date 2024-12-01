use crate::constants::QUOTE_PRECISION;
use crate::error::{ErrorCode, PoolResult};
use crate::math::{Cast, SafeMath};
use crate::state::Investment;
use crate::Size;
use anchor_lang::prelude::*;
use drift_macros::assert_no_slop;
use drift_vaults::state::VaultDepositor;
use static_assertions::const_assert_eq;

#[assert_no_slop]
#[account(zero_copy(unsafe))]
#[derive(Default, Eq, PartialEq, Debug)]
#[repr(C)]
pub struct Pool {
    /// The PDA of this account
    pub pubkey: Pubkey,
    /// Mint of the yield-bearing token backed by this pool: BASIS.
    /// Has 6 decimals (same as USDC).
    pub basis_mint: Pubkey,
    /// USDC mint with which the yield-bearing token is burned/exchanged for, and which deposits are made in.
    /// Has 6 decimals (same as BASIS).
    pub usdc_mint: Pubkey,
    /// Token account to receive USDC when removing a fund, distributing yield, or rebalancing
    pub usdc_vault: Pubkey,
    /// Authority who can sign to modify this account
    pub authority: Pubkey,
    /// To prevent breaching the maximum remaining accounts per instruction of 32,
    /// the number of funds is limited to 16.
    pub investments: [Investment; 16],
    /// Total USDC deposits in the pool which backs the BASIS token.
    /// In QUOTE_PRECISION units
    pub deposits: u128,
    /// Outstanding supply of the BASIS token.
    /// In QUOTE_PRECISION units.
    pub supply: u128,
    /// Exchange rate of BASIS/USDC in QUOTE_PRECISION^2 units
    pub exchange_rate: u128,
    /// Last time yield was distributed from each [`Investment`]
    pub last_distribution_ts: i64,
    /// Last time the [`Investment`] weights were rebalanced
    pub last_rebalance_ts: i64,
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
    pub fn get_investment(&self, investor: Pubkey) -> PoolResult<&Investment> {
        self.investments
            .iter()
            .find(|investment| investment.investor == investor)
            .ok_or(ErrorCode::InvestmentNotFound)
    }

    pub fn get_investment_mut(&mut self, investor: Pubkey) -> PoolResult<&mut Investment> {
        self.investments
            .iter_mut()
            .find(|investment| investment.investor == investor)
            .ok_or(ErrorCode::InvestmentNotFound)
    }
    
    /// Recalculate the weights of all investments based on their realized profit ratios,
    /// and update the weights of each investment.
    /// The weights are used during rebalance to determine the amount of funds to move between investments.
    fn update_investment_weights(&mut self) -> PoolResult<()> {
        let total_weight = self
            .investments
            .iter()
            .flat_map(|i| i.realized_profit_ratio())
            .sum();
        for investment in self.investments.iter_mut() {
            investment.update_weight(total_weight)?;
        }
        Ok(())
    }

    pub fn add_investment(&mut self, investment: Investment) -> PoolResult<usize> {
        let new_investment_index = self
            .investments
            .iter()
            .position(|investment| investment.is_empty())
            .ok_or(ErrorCode::NoInvestmentsAvailable)?;
        self.investments[new_investment_index] = investment;
        self.update_investment_weights()?;
        Ok(new_investment_index)
    }

    pub fn remove_investment(&mut self, index: usize) -> PoolResult<usize> {
        let existing_investment = self
            .investments
            .get(index)
            .ok_or(Investment::default())
            .map_err(|_| ErrorCode::InvestmentNotFound)?;
        let result = if existing_investment.is_empty() {
            Err(ErrorCode::InvestmentNotFound)
        } else {
            self.investments[index] = Investment::default();
            Ok(index)
        };
        self.update_investment_weights()?;
        result
    }

    pub fn initial_exchange_rate() -> PoolResult<u128> {
        1_u128.safe_mul(QUOTE_PRECISION)?.safe_mul(QUOTE_PRECISION)
    }

    pub fn usdc_to_basis(&self, usdc: u64) -> PoolResult<u128> {
        usdc.cast::<u128>()?
            .safe_mul(QUOTE_PRECISION)?
            .safe_mul(QUOTE_PRECISION)?
            .safe_div(self.exchange_rate)
    }

    pub fn basis_to_usdc(&self, basis: u64) -> PoolResult<u128> {
        basis
            .cast::<u128>()?
            .safe_mul(self.exchange_rate)?
            .safe_div(QUOTE_PRECISION)?
            .safe_div(QUOTE_PRECISION)
    }

    /// Deposits and supply are in QUOTE_PRECISION units
    pub fn update_exchange_rate(&mut self) -> PoolResult<()> {
        if self.deposits == 0 || self.supply == 0 {
            self.exchange_rate = Self::initial_exchange_rate()?;
        } else {
            self.exchange_rate = self
                .deposits
                .safe_mul(QUOTE_PRECISION)?
                .safe_mul(QUOTE_PRECISION)?
                .safe_div(self.supply)?;
        }
        Ok(())
    }

    pub fn deposit(&mut self, usdc: u64, investor: &VaultDepositor) -> PoolResult<u64> {
        let basis = self.usdc_to_basis(usdc)?;
        self.deposits = self.deposits.safe_add(usdc.cast()?)?;
        self.supply = self.supply.safe_add(basis)?;
        let investment = self.get_investment_mut(investor.pubkey)?;
        investment.deposit(usdc)?;
        self.update_exchange_rate()?;
        basis.cast()
    }

    pub fn withdraw(&mut self, basis: u64, investor: &VaultDepositor) -> PoolResult<u64> {
        let usdc = self.basis_to_usdc(basis)?;
        self.deposits = self.deposits.safe_sub(usdc)?;
        self.supply = self.supply.safe_sub(basis.cast()?)?;
        let investment = self.get_investment_mut(investor.pubkey)?;
        investment.withdraw(usdc.cast()?)?;
        self.update_exchange_rate()?;
        usdc.cast()
    }

    pub fn distribute_yield(
        &mut self,
        amount: u64,
        investor: &VaultDepositor,
        clock: &Clock,
    ) -> PoolResult<()> {
        let investment = self.get_investment_mut(investor.pubkey)?;
        investment.distribute_yield(amount)?;
        self.deposits = self.deposits.safe_add(amount.cast()?)?;
        self.last_distribution_ts = clock.unix_timestamp;
        self.update_exchange_rate()?;
        Ok(())
    }
}
