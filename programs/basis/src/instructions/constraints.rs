use anchor_lang::prelude::*;

use crate::state::*;

pub fn is_authority_for_pool(pool: &AccountLoader<Pool>, signer: &Signer) -> Result<bool> {
    Ok(pool.load()?.authority.eq(signer.key))
}
