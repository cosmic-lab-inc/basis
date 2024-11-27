import { PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { BASIS_PROGRAM_ID } from '../types';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

export function getPoolAddressSync(basisMint: PublicKey): PublicKey {
	return PublicKey.findProgramAddressSync(
		[Buffer.from(anchor.utils.bytes.utf8.encode('pool')), basisMint.toBuffer()],
		BASIS_PROGRAM_ID
	)[0];
}

export function getFundTrackerAddressSync(
	pool: PublicKey,
	fundMint: PublicKey
): PublicKey {
	return PublicKey.findProgramAddressSync(
		[
			Buffer.from(anchor.utils.bytes.utf8.encode('fund_tracker')),
			pool.toBuffer(),
			fundMint.toBuffer(),
		],
		BASIS_PROGRAM_ID
	)[0];
}

export function getFundTrackerTokenAddressSync(
	fundTracker: PublicKey,
	fundMint: PublicKey
): PublicKey {
	return getAssociatedTokenAddressSync(fundMint, fundTracker, true);
}
