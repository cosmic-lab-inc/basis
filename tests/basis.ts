import * as anchor from '@coral-xyz/anchor';
import { ConfirmOptions, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { before } from 'mocha';
import {
	Basis,
	getPoolAddressSync,
	getFundTrackerAddressSync,
	MOCK_USDC_MINT,
	getFundTrackerTokenAddressSync,
} from '../ts/sdk';
import { assert } from 'chai';
import { createAtaIdempotent, createMintIxs, sendAndConfirm } from './helpers';

describe('basis', () => {
	const opts: ConfirmOptions = {
		preflightCommitment: 'confirmed',
		skipPreflight: false,
		commitment: 'confirmed',
	};

	// Configure the client to use the local cluster.
	const provider = anchor.AnchorProvider.local(undefined, opts);
	anchor.setProvider(provider);
	const conn = provider.connection;
	// @ts-ignore
	const payer: Keypair = provider.wallet.payer as any as Keypair;
	const program = anchor.workspace.Basis as anchor.Program<Basis>;

	const poolAuth = Keypair.generate();
	const fundTrackerAuth = Keypair.generate();
	const basisMint = Keypair.generate();
	const usdcMint = MOCK_USDC_MINT;
	const fundMint = Keypair.generate();

	const pool = getPoolAddressSync(basisMint.publicKey);
	const fundTracker = getFundTrackerAddressSync(pool, fundMint.publicKey);
	const fundTrackerToken = getFundTrackerTokenAddressSync(
		fundTracker,
		fundMint.publicKey
	);

	before(async () => {
		const poolAuthAirdropSig = await conn.requestAirdrop(
			poolAuth.publicKey,
			LAMPORTS_PER_SOL * 10
		);
		const poolAuthConfirmAirdrop = (
			await conn.confirmTransaction(poolAuthAirdropSig)
		).value;
		if (poolAuthConfirmAirdrop.err) {
			throw new Error(
				`Failed to confirm airdrop for poolAuth: ${poolAuthConfirmAirdrop.err}`
			);
		}
		console.log('airdropped to poolAuth');

		const fundTrackerAuthAirdropSig = await conn.requestAirdrop(
			fundTrackerAuth.publicKey,
			LAMPORTS_PER_SOL * 10
		);
		const fundTrackerAuthConfirmAirdrop = (
			await conn.confirmTransaction(fundTrackerAuthAirdropSig)
		).value;
		if (fundTrackerAuthConfirmAirdrop.err) {
			throw new Error(
				`Failed to confirm airdrop for fundTrackerAuth: ${fundTrackerAuthConfirmAirdrop.err}`
			);
		}
		console.log('airdropped to fundTrackerAuth');

		const usdcMintIxs = await createMintIxs(
			conn,
			payer.publicKey,
			usdcMint,
			6,
			payer.publicKey
		);
		await sendAndConfirm(conn, payer, usdcMintIxs, [usdcMint]);
		console.log('created usdc mint');

		const fundMintIxs = await createMintIxs(
			conn,
			fundTrackerAuth.publicKey,
			fundMint,
			6,
			fundTrackerAuth.publicKey
		);
		await sendAndConfirm(conn, fundTrackerAuth, fundMintIxs, [fundMint]);
		console.log('created fund mint');
	});

	it('Initialize Pool', async () => {
		const ix = await program.methods
			.initializePool()
			.accounts({
				authority: poolAuth.publicKey,
				payer: poolAuth.publicKey,
				pool,
				basisMint: basisMint.publicKey,
				usdcMint: usdcMint.publicKey,
			})
			.instruction();
		await sendAndConfirm(conn, poolAuth, [ix], [basisMint]);
	});

	it('Initialize Fund Tracker', async () => {
		const { instructions: ataIxs, key: ataKey } = await createAtaIdempotent(
			conn,
			fundTracker,
			fundTrackerAuth.publicKey,
			fundMint.publicKey
		);
		assert(ataKey.equals(fundTrackerToken));
		// await sendAndConfirm(conn, fundTrackerAuth, ataIxs);

		const ix = await program.methods
			.initializeFundTracker()
			.accounts({
				authority: fundTrackerAuth.publicKey,
				payer: fundTrackerAuth.publicKey,
				pool,
				fundTracker,
				token: fundTrackerToken,
				mint: fundMint.publicKey,
			})
			.instruction();
		await sendAndConfirm(conn, fundTrackerAuth, [...ataIxs, ix]);
	});
});
