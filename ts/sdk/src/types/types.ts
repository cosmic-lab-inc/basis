import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

export const BASIS_PROGRAM_ID = new PublicKey(
	'Basis9pRdq5cFHdnML4asQE8oFjRWX7qbL9H5boN91x'
);

export type Pool = {
	pubkey: PublicKey;
	basisMint: PublicKey;
	usdcMint: PublicKey;
	authority: PublicKey;
	funds: PublicKey[];
	deposits: BN;
	supply: BN;
	exchangeRate: BN;
	lastDistributionTs: BN;
	lastRebalanceTs: BN;
	initTs: BN;
	bump: number;
	padding: number[];
};

export type FundTracker = {
	pubkey: PublicKey;
	pool: PublicKey;
	mint: PublicKey;
	token: PublicKey;
	authority: PublicKey;
	initTs: BN;
	weight: number;
	bump: number;
	padding: number[];
};
