use anchor_lang::prelude::*;

pub trait TokenTransfer {
    fn token_transfer(&self, amount: u64) -> Result<()>;
}

pub trait DriftVaultsInitializeInvestor {
    fn initialize_investor(&self) -> Result<()>;
}

pub trait DriftVaultsDeposit {
    fn deposit(&self, usdc: u64) -> Result<()>;
}
