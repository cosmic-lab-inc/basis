use anchor_lang::prelude::*;

pub type PoolResult<T = ()> = std::result::Result<T, ErrorCode>;

#[error_code]
#[derive(PartialEq, Eq)]
pub enum ErrorCode {
    #[msg("Default")]
    Default,
    #[msg("MathError")]
    MathError,
    #[msg("CastError")]
    CastError,
    #[msg("UnwrapError")]
    UnwrapError,
    #[msg("NoFundTrackersAvailable")]
    NoInvestmentsAvailable,
    #[msg("FundTrackerNotFound")]
    InvestmentNotFound,
    #[msg("BnConversion")]
    BnConversion,
    #[msg("NoSiblingInstruction")]
    NoSiblingInstruction,
    #[msg("NoDepositsAvailable")]
    NoDepositsAvailable,
    #[msg("NoYieldAvailable")]
    NoYieldAvailable,
}

#[macro_export]
macro_rules! cast_error {
    () => {{
        || {
            let error_code = $crate::error::ErrorCode::CastError;
            msg!("Error {} thrown at {}:{}", error_code, file!(), line!());
            error_code
        }
    }};
}

#[macro_export]
macro_rules! math_error {
    () => {{
        || {
            let error_code = $crate::error::ErrorCode::MathError;
            msg!("Error {} thrown at {}:{}", error_code, file!(), line!());
            error_code
        }
    }};
}

#[macro_export]
macro_rules! unwrap_error {
    () => {{
        || {
            let error_code = $crate::error::ErrorCode::UnwrapError;
            msg!("Error {} thrown at {}:{}", error_code, file!(), line!());
            error_code
        }
    }};
}
