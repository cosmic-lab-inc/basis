#[cfg(test)]
mod basis_tests {
    use crate::constants::QUOTE_PRECISION;
    use crate::error::PoolResult;
    use crate::math::casting::Cast;
    use crate::math::SafeMath;

    #[test]
    fn usdc_to_basis_u64() -> PoolResult<()> {
        let usdc_f64 = 50502.123456;
        let usdc = (usdc_f64 * QUOTE_PRECISION as f64) as u128;
        let exchange_rate_f64 = 1.010042469120;
        let exchange_rate =
            (exchange_rate_f64 * QUOTE_PRECISION as f64 * QUOTE_PRECISION as f64) as u128;
        let s0 = usdc.safe_mul(QUOTE_PRECISION)?.safe_mul(QUOTE_PRECISION)?;
        println!("utb0: {}", s0);
        let s1 = s0.safe_div(exchange_rate)?;
        println!("utb1: {}", s1);
        let s2 = s1.cast::<u64>()?;
        println!("utb2: {}", s2);

        Ok(())
    }

    #[test]
    fn basis_to_usdc_u64() -> PoolResult<()> {
        let basis_f64 = 50_000.0;
        let basis = (basis_f64 * QUOTE_PRECISION as f64) as u128;
        let exchange_rate_f64 = 1.010042469120;
        let exchange_rate =
            (exchange_rate_f64 * QUOTE_PRECISION as f64 * QUOTE_PRECISION as f64) as u128;
        let s0 = basis;
        println!("btu0: {}", s0);
        let s1 = s0
            .safe_mul(exchange_rate)?
            .safe_div(QUOTE_PRECISION)?
            .safe_div(QUOTE_PRECISION)?;
        println!("btu1: {}", s1);
        let s2 = s1.cast::<u64>()?;
        println!("btu2: {}", s2);

        Ok(())
    }

    #[test]
    fn exchange_rate() -> PoolResult<()> {
        let deposits_f64 = 50_502.123456;
        let deposits = (deposits_f64 * QUOTE_PRECISION as f64) as u128;
        let supply_f64 = 50_000.0;
        let supply = (supply_f64 * QUOTE_PRECISION as f64) as u128;
        let exchange_rate = deposits
            .safe_mul(QUOTE_PRECISION)?
            .safe_mul(QUOTE_PRECISION)?
            .safe_div(supply)?;
        println!("exr: {}", exchange_rate);

        Ok(())
    }

    #[test]
    fn investor_equity() -> PoolResult<()> {
        let vault_equity = 50_502_058_334;
        let vault_shares = 50_000_000_000;
        let investor_shares = 50_000_000_000;

        Ok(())
    }
}
