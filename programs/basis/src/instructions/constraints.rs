use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use drift_vaults::state::VaultDepositor;
use solana_program::program_option::COption;

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

pub fn is_basis_mint(pool: &AccountLoader<Pool>, mint: &Account<Mint>) -> Result<bool> {
    Ok(match mint.mint_authority {
        COption::Some(mint_auth) => {
            pool.load()?.basis_mint.eq(&mint.key()) && mint_auth.eq(&pool.key())
        }
        COption::None => false,
    })
}
