use anchor_lang::prelude::*;

#[derive(Debug, Clone)]
pub struct DriftVaults;

impl Id for DriftVaults {
    fn id() -> Pubkey {
        drift_vaults::ID
    }
}
