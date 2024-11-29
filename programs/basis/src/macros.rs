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
macro_rules! declare_pool_seeds {
    ( $pool_loader:expr, $name: ident ) => {
        let pool = $pool_loader.load()?;
        let basis_mint = pool.basis_mint;
        let bump = pool.bump;
        let $name = &[&Pool::get_pool_signer_seeds(basis_mint.as_ref(), &bump)[..]];
        drop(pool);
    };
}

#[macro_export]
macro_rules! declare_pool_payer_seeds {
    ( $pool_loader:expr, $pool_payer_bump:expr, $name: ident ) => {
        let pool_key = $pool_loader.key();
        let bump = $pool_payer_bump;
        let $name = &[&Pool::get_pool_payer_signer_seeds(pool_key.as_ref(), &bump)[..]];
    };
}
