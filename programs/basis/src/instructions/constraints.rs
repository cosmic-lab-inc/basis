use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};
use solana_program::program_option::COption;

use crate::state::*;

pub fn is_authority_for_pool(pool: &AccountLoader<Pool>, signer: &Signer) -> Result<bool> {
    Ok(pool.load()?.authority.eq(signer.key))
}

pub fn is_basis_mint(pool: &AccountLoader<Pool>, mint: &Account<Mint>) -> Result<bool> {
    Ok(match mint.mint_authority {
        COption::Some(mint_auth) => {
            pool.load()?.basis_mint.eq(&mint.key()) && mint_auth.eq(&pool.key())
        }
        COption::None => false,
    })
}

pub fn is_pool_usdc_vault(
    pool: &AccountLoader<Pool>,
    token_account: &Account<TokenAccount>,
) -> Result<bool> {
    Ok(pool.load()?.usdc_vault.eq(&token_account.key()))
}
