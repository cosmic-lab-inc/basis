#[macro_export]
macro_rules! validate {
        ($assert:expr, $err:expr) => {{
            if ($assert) {
                Ok(())
            } else {
                let error_code: ErrorCode = $err;
                msg!("Error {} thrown at {}:{}", error_code, file!(), line!());
                Err(error_code)
            }
        }};
        ($assert:expr, $err:expr, $($arg:tt)+) => {{
        if ($assert) {
            Ok(())
        } else {
            let error_code: ErrorCode = $err;
            msg!("Error {} thrown at {}:{}", error_code, file!(), line!());
            msg!($($arg)*);
            Err(error_code)
        }
    }};
}

#[macro_export]
macro_rules! declare_fund_tracker_seeds {
    ( $fund_tracker_loader:expr, $name: ident ) => {
        let fund_tracker = $fund_tracker_loader.load()?;
        let pool = fund_tracker.pool;
        let fund_token_mint = fund_tracker.fund_token_mint;
        let bump = fund_tracker.bump;
        let $name =
            &[&FundTracker::get_fund_tracker_signer_seeds(&pool, &fund_token_mint, &bump)[..]];
        drop(fund_tracker);
    };
}
