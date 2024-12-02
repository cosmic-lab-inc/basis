#[cfg(test)]
mod basis_tests {
    use crate::constants::{PERCENTAGE_PRECISION, QUOTE_PRECISION};
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
    fn investment_profit_ratio() -> PoolResult<()> {
        let d1: u128 = 50_000_000_000;
        let p1: u128 = 451_852_498;
        let sw1: u32 = 1_000_000;
        let pr1: u128 = p1
            .safe_mul(QUOTE_PRECISION)?
            .safe_mul(QUOTE_PRECISION)?
            .safe_div(d1)?;
        println!("pr1: {}", pr1);

        let d2: u128 = 50_000_000_000;
        let p2: u128 = 0;
        let sw2: u32 = 300_000;

        let total_pr = pr1;

        let rem_w = PERCENTAGE_PRECISION.safe_sub(sw2.cast()?)?;
        let undiluted_sw2 = sw2
            .cast::<u128>()?
            .safe_mul(PERCENTAGE_PRECISION)?
            .safe_mul(PERCENTAGE_PRECISION)?
            .safe_div(rem_w)?
            .safe_div(PERCENTAGE_PRECISION)?;
        println!("undiluted_sw2: {}", undiluted_sw2);

        let pr2 = undiluted_sw2
            .cast::<u128>()?
            .safe_mul(total_pr)?
            .safe_div(PERCENTAGE_PRECISION)?;
        println!("pr2: {}", pr2);

        let tpr = pr1.safe_add(pr2)?;
        println!("tpr: {}", tpr);

        let ew1 = pr1.safe_mul(PERCENTAGE_PRECISION)?.safe_div(tpr)?;
        println!("ew1: {}", ew1);

        let ew2 = pr2.safe_mul(PERCENTAGE_PRECISION)?.safe_div(tpr)?;
        println!("ew2: {}", ew2);

        let tw = ew1.safe_add(ew2)?;
        println!("tw: {}", tw);

        Ok(())
    }

    #[test]
    fn update_weights() -> PoolResult<()> {
        let total_profit_ratio: u128 = 9_037_049_980;
        let ignore_weight = 300_000;

        let ignore_profit_ratio = ignore_weight
            .cast::<u128>()?
            .safe_mul(total_profit_ratio)?
            .safe_div(PERCENTAGE_PRECISION)?;
        println!("ipr: {}", ignore_profit_ratio);

        let total_weight = total_profit_ratio.safe_add(ignore_profit_ratio)?;
        println!("tw: {}", total_weight);

        Ok(())
    }

    #[test]
    fn rebalance_investment_deposit() -> PoolResult<()> {
        let investment_deposits: u128 = 30_000.safe_mul(QUOTE_PRECISION)?;
        // let investment_deposits: u128 = 0;
        let pool_deposits_f64 = 50_000.0;
        let pool_deposits: u128 = 50_000.safe_mul(QUOTE_PRECISION)?;
        let investment_weight_f64 = 0.769230;
        let investment_weight: u128 = 769_230;

        let expected = pool_deposits_f64 * investment_weight_f64;
        println!("expected target deposits: {}", expected);

        let target_deposit = investment_weight
            .safe_mul(PERCENTAGE_PRECISION)?
            .safe_mul(pool_deposits)?
            .safe_div(PERCENTAGE_PRECISION)?
            .safe_div(PERCENTAGE_PRECISION)?;
        println!("actual target deposits: {}", target_deposit);

        let rebalance = target_deposit
            .cast::<i64>()?
            .safe_sub(investment_deposits.cast()?)?;
        println!("rebalance: {}", rebalance);

        Ok(())
    }
}
