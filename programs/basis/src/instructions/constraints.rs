use anchor_lang::prelude::*;
use drift_vaults::state::VaultDepositor;

use crate::state::*;

pub fn is_authority_for_pool(pool: &AccountLoader<Pool>, signer: &Signer) -> Result<bool> {
    Ok(pool.load()?.authority.eq(signer.key))
}

pub fn is_authority_for_investor(
    investor: &AccountLoader<VaultDepositor>,
    key: &Pubkey,
) -> Result<bool> {
    Ok(investor.load()?.authority.eq(key))
}
