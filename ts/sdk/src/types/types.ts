import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

export const BASIS_PROGRAM_ID = new PublicKey(
	'Basis9pRdq5cFHdnML4asQE8oFjRWX7qbL9H5boN91x'
);

export type Investment = {
	investor: PublicKey;
	equity: BN;
	profit: BN;
	initTs: BN;
	weight: number;
	padding: number[];
};

export type Pool = {
	pubkey: PublicKey;
	basisMint: PublicKey;
	usdcMint: PublicKey;
	usdcVault: PublicKey;
	authority: PublicKey;
	investments: Investment[];
	deposits: BN;
	supply: BN;
	exchangeRate: BN;
	lastDistributionTs: BN;
	lastRebalanceTs: BN;
	initTs: BN;
	bump: number;
	padding: number[];
};

export type AddInvestmentParams = {
	weight: number;
};

export type RemoveInvestmentParams = {
	investmentIndex: number;
};

export type PoolDepositParams = {
	usdc: BN;
};

export type RequestVaultWithdrawParams = {
	basis: BN;
};

export type PoolWithdrawParams = {
	basis: BN;
};

export class Venue {
	static readonly DRIFT = { drift: {} };
	static readonly PHOENIX = { phoenix: {} };
}
