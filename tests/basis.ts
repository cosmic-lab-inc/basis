import * as anchor from '@coral-xyz/anchor';
import { ConfirmOptions, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { before } from 'mocha';
import {
	Basis,
	getPoolAddressSync,
	MOCK_USDC_MINT,
	getPoolFundTrackerTokenAddressSync,
	AddFundParams,
	Pool,
	FundTracker,
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
	const basisMint = Keypair.generate();
	const usdcMint = MOCK_USDC_MINT;
	const fundMint = Keypair.generate();

	const pool = getPoolAddressSync(basisMint.publicKey);
	const fundTrackerToken = getPoolFundTrackerTokenAddressSync(
		pool,
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
			poolAuth.publicKey,
			fundMint,
			6,
			poolAuth.publicKey
		);
		await sendAndConfirm(conn, poolAuth, fundMintIxs, [fundMint]);
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

	it('Add Fund', async () => {
		const { instructions: ataIxs, key: ataKey } = await createAtaIdempotent(
			conn,
			pool,
			poolAuth.publicKey,
			fundMint.publicKey
		);
		assert(ataKey.equals(fundTrackerToken));

		const params: AddFundParams = {
			weight: 1,
		};
		const ix = await program.methods
			.addFund(params)
			.accounts({
				authority: poolAuth.publicKey,
				payer: poolAuth.publicKey,
				pool,
				token: fundTrackerToken,
				mint: fundMint.publicKey,
			})
			.instruction();
		await sendAndConfirm(conn, poolAuth, [...ataIxs, ix]);

		const poolAcct: Pool = await program.account.pool.fetch(pool);
		const fundTrackerAcct: FundTracker = poolAcct.funds[0];
		assert(fundTrackerAcct.token.equals(fundTrackerToken));
	});
});
