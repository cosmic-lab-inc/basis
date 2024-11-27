use anchor_lang::prelude::*;

use crate::state::*;

pub fn is_authority_for_fund_tracker(
    investor: &AccountLoader<FundTracker>,
    signer: &Signer,
) -> Result<bool> {
    Ok(investor.load()?.authority.eq(signer.key))
}
