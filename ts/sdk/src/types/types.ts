import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

export const BASIS_PROGRAM_ID = new PublicKey(
	'Basis9pRdq5cFHdnML4asQE8oFjRWX7qbL9H5boN91x'
);

export type FundTracker = {
	mint: PublicKey;
	token: PublicKey;
	initTs: BN;
	weight: number;
	padding: number[];
};

export type Pool = {
	pubkey: PublicKey;
	basisMint: PublicKey;
	usdcMint: PublicKey;
	authority: PublicKey;
	funds: FundTracker[];
	deposits: BN;
	supply: BN;
	exchangeRate: BN;
	lastDistributionTs: BN;
	lastRebalanceTs: BN;
	initTs: BN;
	bump: number;
	padding: number[];
};

export type AddFundParams = {
	weight: number;
};

export type RemoveFundParams = {
	fundIndex: number;
};
