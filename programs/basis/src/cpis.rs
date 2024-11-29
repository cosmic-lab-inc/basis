use anchor_lang::prelude::*;

pub trait TokenTransfer {
    fn token_transfer(&self, amount: u64) -> Result<()>;
}

pub trait DriftInitializeInvestor {
    fn initialize_investor(&self) -> Result<()>;
}
