import { BN } from '@coral-xyz/anchor';
import { Keypair } from '@solana/web3.js';

export const ZERO = new BN(0);
export const QUOTE_PRECISION_EXP = new BN(6);
export const PRICE_PRECISION_EXP = new BN(6);
export const QUOTE_PRECISION = new BN(10).pow(QUOTE_PRECISION_EXP);
export const PRICE_PRECISION = new BN(10).pow(PRICE_PRECISION_EXP);
export const PERCENTAGE_PRECISION_EXP = new BN(6);
export const PERCENTAGE_PRECISION = new BN(10).pow(PERCENTAGE_PRECISION_EXP);

export const MOCK_USDC_MINT = Keypair.fromSecretKey(
	Uint8Array.from([
		87, 198, 89, 198, 67, 63, 51, 219, 219, 205, 135, 80, 234, 56, 140, 16, 89,
		50, 81, 229, 158, 31, 99, 65, 96, 2, 245, 44, 73, 148, 172, 223, 207, 221,
		139, 122, 3, 190, 18, 238, 58, 168, 238, 122, 70, 81, 217, 218, 189, 29,
		109, 94, 252, 95, 110, 157, 33, 107, 20, 14, 201, 83, 184, 122,
	])
);
export const MOCK_USDC_DECIMALS = 6;
export const MOCK_USDC_PRECISION = new BN(10).pow(new BN(MOCK_USDC_DECIMALS));
