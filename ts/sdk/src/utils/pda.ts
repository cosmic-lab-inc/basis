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

export function getPoolPayerAddressSync(pool: PublicKey): PublicKey {
	return PublicKey.findProgramAddressSync(
		[
			Buffer.from(anchor.utils.bytes.utf8.encode('pool_payer')),
			pool.toBuffer(),
		],
		BASIS_PROGRAM_ID
	)[0];
}

export function getPoolUsdcVaultAddressSync(
	pool: PublicKey,
	usdcMint: PublicKey
): PublicKey {
	return getAssociatedTokenAddressSync(usdcMint, pool, true);
}

export function getPoolPayerUsdcVaultAddressSync(
	poolPayer: PublicKey,
	usdcMint: PublicKey
): PublicKey {
	return getAssociatedTokenAddressSync(usdcMint, poolPayer, true);
}
