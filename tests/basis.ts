import * as anchor from '@coral-xyz/anchor';
import {
	AdminClient,
	BN,
	BulkAccountLoader,
	OracleSource,
	PEG_PRECISION,
	PublicKey,
	QUOTE_PRECISION,
	User,
	UserAccount,
	ZERO,
} from '@drift-labs/sdk';
import {
	bootstrapSignerClientAndUser,
	initializeQuoteSpotMarket,
	mockOracle,
} from './driftHelpers';
import { ConfirmOptions, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
	DriftVaults,
	encodeName,
	getVaultAddressSync,
	getVaultDepositorAddressSync,
	getVaultProtocolAddressSync,
	VaultClient,
	VaultDepositor,
	VaultProtocolParams,
	Vault,
} from '@drift-labs/vaults-sdk';
import { assert } from 'chai';
import {
	AddInvestmentParams,
	Basis,
	DRIFT_PROGRAM_ID,
	DRIFT_VAULTS_PROGRAM_ID,
	getPoolAddressSync,
	getPoolPayerAddressSync,
	getPoolPayerUsdcVaultAddressSync,
	getPoolUsdcVaultAddressSync,
	Pool,
	PoolDepositParams,
	TEST_MANAGER,
	TEST_USDC_DECIMALS,
	TEST_USDC_MINT,
	TEST_USDC_MINT_AUTHORITY,
} from '../ts/sdk';
import {
	createAtaIdempotent,
	createMintIxs,
	sendAndConfirm,
	tokenBalance,
} from './helpers';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

describe('basis', () => {
	const opts: ConfirmOptions = {
		preflightCommitment: 'confirmed',
		skipPreflight: false,
		commitment: 'confirmed',
	};

	const provider = anchor.AnchorProvider.local(undefined, opts);
	anchor.setProvider(provider);
	const connection = provider.connection;
	// @ts-ignore
	const payer: Keypair = provider.wallet.payer as any as Keypair;

	const program = anchor.workspace.DriftVaults as anchor.Program<DriftVaults>;

	const basisProgram = anchor.workspace.Basis as anchor.Program<Basis>;

	const bulkAccountLoader = new BulkAccountLoader(connection, 'confirmed', 1);

	let adminClient: AdminClient;

	const manager = TEST_MANAGER;
	let managerClient: VaultClient;
	let managerUser: User;

	let fillerClient: VaultClient;
	let fillerUser: User;

	let delegate: Keypair;
	let delegateClient: VaultClient;

	let protocol: Keypair;
	let protocolClient: VaultClient;

	let poolDepositor: Keypair;
	let poolDepositorUsdcTokenAccount: PublicKey;
	let poolDepositorBasisTokenAccount: PublicKey;

	const usdcMint = TEST_USDC_MINT;
	const usdcMintAuth = TEST_USDC_MINT_AUTHORITY;
	let solPerpOracle: PublicKey;

	const protocolVaultName = 'Top 50 Momentum';
	const protocolVault = getVaultAddressSync(
		program.programId,
		encodeName(protocolVaultName)
	);

	const initialSolPerpPrice = 100;
	const usdcUiAmount = 50_000;
	const usdcAmount = new BN(usdcUiAmount).mul(QUOTE_PRECISION);
	// const finalSolPerpPrice = initialSolPerpPrice + 10;
	// const baseAssetAmount = new BN(50).mul(BASE_PRECISION);

	const poolAuth = Keypair.generate();
	const basisMint = Keypair.generate();
	const pool = getPoolAddressSync(basisMint.publicKey);
	let poolClient: VaultClient;
	const poolUsdcVault = getPoolUsdcVaultAddressSync(pool, usdcMint.publicKey);
	const poolPayer = getPoolPayerAddressSync(pool);
	const poolPayerUsdcVault = getPoolPayerUsdcVaultAddressSync(
		poolPayer,
		usdcMint.publicKey
	);

	const investor = getVaultDepositorAddressSync(
		DRIFT_VAULTS_PROGRAM_ID,
		protocolVault,
		poolPayer
	);

	before(async () => {
		const poolAuthAirdropSig = await connection.requestAirdrop(
			poolAuth.publicKey,
			LAMPORTS_PER_SOL * 10
		);
		const poolAuthConfirmAirdrop = (
			await connection.confirmTransaction(poolAuthAirdropSig)
		).value;
		if (poolAuthConfirmAirdrop.err) {
			throw new Error(
				`Failed to confirm airdrop for poolAuth: ${poolAuthConfirmAirdrop.err}`
			);
		}

		const usdcMintIxs = await createMintIxs(
			connection,
			payer.publicKey,
			usdcMint,
			TEST_USDC_DECIMALS,
			usdcMintAuth.publicKey
		);
		await sendAndConfirm(connection, payer, usdcMintIxs, [usdcMint]);

		const poolPayerUsdcVaultIxs = await createAtaIdempotent(
			connection,
			poolPayer,
			payer.publicKey,
			usdcMint.publicKey
		);
		await sendAndConfirm(connection, payer, poolPayerUsdcVaultIxs);

		solPerpOracle = await mockOracle(initialSolPerpPrice);

		const perpMarketIndexes = [0];
		const spotMarketIndexes = [0];
		const oracleInfos = [
			{ publicKey: solPerpOracle, source: OracleSource.PYTH },
		];

		adminClient = new AdminClient({
			connection,
			wallet: provider.wallet,
			opts: {
				commitment: 'confirmed',
			},
			activeSubAccountId: 0,
			perpMarketIndexes,
			spotMarketIndexes,
			oracleInfos,
			accountSubscription: {
				type: 'websocket',
				resubTimeoutMs: 30_000,
			},
		});

		await adminClient.initialize(usdcMint.publicKey, true);
		await adminClient.subscribe();
		await initializeQuoteSpotMarket(adminClient, usdcMint.publicKey);

		const mantissaSqrtScale = new BN(100_000);
		await adminClient.initializePerpMarket(
			0,
			solPerpOracle,
			new BN(5 * 10 ** 13).mul(mantissaSqrtScale),
			new BN(5 * 10 ** 13).mul(mantissaSqrtScale),
			new BN(0),
			new BN(initialSolPerpPrice).mul(PEG_PRECISION)
		);
		await adminClient.updatePerpAuctionDuration(new BN(0));
		await adminClient.updatePerpMarketCurveUpdateIntensity(0, 100);

		// init vault manager
		const bootstrapManager = await bootstrapSignerClientAndUser({
			payer: provider,
			programId: program.programId,
			usdcMint,
			usdcMintAuth,
			usdcAmount,
			signer: manager,
			depositCollateral: false,
			driftClientConfig: {
				accountSubscription: {
					type: 'websocket',
					resubTimeoutMs: 30_000,
				},
				opts,
				activeSubAccountId: 0,
				perpMarketIndexes,
				spotMarketIndexes,
				oracleInfos,
			},
		});
		managerClient = bootstrapManager.vaultClient;
		managerUser = bootstrapManager.user;

		// init delegate who trades with vault funds
		const bootstrapDelegate = await bootstrapSignerClientAndUser({
			payer: provider,
			programId: program.programId,
			usdcMint,
			usdcMintAuth,
			usdcAmount,
			driftClientConfig: {
				accountSubscription: {
					type: 'websocket',
					resubTimeoutMs: 30_000,
				},
				opts,
				activeSubAccountId: 0,
				perpMarketIndexes,
				spotMarketIndexes,
				oracleInfos,
			},
		});
		delegate = bootstrapDelegate.signer;
		delegateClient = bootstrapDelegate.vaultClient;

		// init a market filler for manager to trade against
		const bootstrapFiller = await bootstrapSignerClientAndUser({
			payer: provider,
			programId: program.programId,
			usdcMint,
			usdcMintAuth,
			usdcAmount,
			depositCollateral: true,
			driftClientConfig: {
				accountSubscription: {
					type: 'websocket',
					resubTimeoutMs: 30_000,
				},
				opts,
				activeSubAccountId: 0,
				perpMarketIndexes,
				spotMarketIndexes,
				oracleInfos,
			},
		});
		fillerClient = bootstrapFiller.vaultClient;
		fillerUser = bootstrapFiller.user;

		// init protocol
		const bootstrapProtocol = await bootstrapSignerClientAndUser({
			payer: provider,
			programId: program.programId,
			usdcMint,
			usdcMintAuth,
			usdcAmount,
			driftClientConfig: {
				accountSubscription: {
					type: 'websocket',
					resubTimeoutMs: 30_000,
				},
				opts,
				activeSubAccountId: 0,
				perpMarketIndexes,
				spotMarketIndexes,
				oracleInfos,
			},
		});
		protocol = bootstrapProtocol.signer;
		protocolClient = bootstrapProtocol.vaultClient;

		const bootstrapPoolDepositor = await bootstrapSignerClientAndUser({
			payer: provider,
			programId: program.programId,
			usdcMint,
			usdcMintAuth,
			usdcAmount,
			driftClientConfig: {
				accountSubscription: {
					type: 'websocket',
					resubTimeoutMs: 30_000,
				},
				opts,
				activeSubAccountId: 0,
				perpMarketIndexes,
				spotMarketIndexes,
				oracleInfos,
			},
		});
		poolDepositor = bootstrapPoolDepositor.signer;
		poolDepositorUsdcTokenAccount = bootstrapPoolDepositor.userUSDCAccount;
		poolDepositorBasisTokenAccount = getAssociatedTokenAddressSync(
			basisMint.publicKey,
			poolDepositor.publicKey
		);

		const bootstrapPool = await bootstrapSignerClientAndUser({
			payer: provider,
			programId: program.programId,
			usdcMint,
			usdcMintAuth,
			usdcAmount,
			signer: poolAuth,
			driftClientConfig: {
				authority: pool,
				accountSubscription: {
					type: 'websocket',
					resubTimeoutMs: 30_000,
				},
				opts,
				activeSubAccountId: 0,
				perpMarketIndexes,
				spotMarketIndexes,
				oracleInfos,
			},
		});
		poolClient = bootstrapPool.vaultClient;

		// start account loader
		bulkAccountLoader.startPolling();
		await bulkAccountLoader.load();
	});

	after(async () => {
		await managerClient.driftClient.unsubscribe();
		await fillerClient.driftClient.unsubscribe();
		await delegateClient.driftClient.unsubscribe();
		await protocolClient.driftClient.unsubscribe();
		await adminClient.unsubscribe();

		await managerUser.unsubscribe();
		await fillerUser.unsubscribe();

		bulkAccountLoader.stopPolling();
	});

	it('Initialize Vault', async () => {
		const vpParams: VaultProtocolParams = {
			protocol: protocol.publicKey,
			protocolFee: new BN(0),
			// 100_000 = 10%
			protocolProfitShare: 100_000,
		};
		await managerClient.initializeVault({
			name: encodeName(protocolVaultName),
			spotMarketIndex: 0,
			redeemPeriod: ZERO,
			maxTokens: ZERO,
			managementFee: ZERO,
			profitShare: 0,
			hurdleRate: 0,
			permissioned: false,
			minDepositAmount: ZERO,
			vaultProtocol: vpParams,
		});
		const vaultAcct = await program.account.vault.fetch(protocolVault);
		assert(vaultAcct.manager.equals(manager.publicKey));
		const vp = getVaultProtocolAddressSync(
			managerClient.program.programId,
			protocolVault
		);
		// asserts "exit" was called on VaultProtocol to define the discriminator
		const vpAcctInfo = await connection.getAccountInfo(vp);
		assert(vpAcctInfo !== null);
		// asserts Vault and VaultProtocol fields were set properly
		assert(vaultAcct.vaultProtocol);
		const vpAcct = await program.account.vaultProtocol.fetch(vp);
		assert(vpAcct.protocol.equals(protocol.publicKey));
	});

	// assign "delegate" to trade on behalf of the vault
	it('Update Vault Delegate', async () => {
		const vaultAccount = await program.account.vault.fetch(protocolVault);
		await managerClient.program.methods
			.updateDelegate(delegate.publicKey)
			.accounts({
				vault: protocolVault,
				driftUser: vaultAccount.user,
				driftProgram: adminClient.program.programId,
			})
			.rpc();
		const user = (await adminClient.program.account.user.fetch(
			vaultAccount.user
		)) as UserAccount;
		assert(user.delegate.equals(delegate.publicKey));
	});

	it('Initialize Pool', async () => {
		const ataIxs = await createAtaIdempotent(
			connection,
			pool,
			poolAuth.publicKey,
			usdcMint.publicKey
		);
		const ix = await basisProgram.methods
			.initializePool()
			.accounts({
				authority: poolAuth.publicKey,
				payer: poolAuth.publicKey,
				pool,
				basisMint: basisMint.publicKey,
				usdcMint: usdcMint.publicKey,
				usdcVault: poolUsdcVault,
			})
			.instruction();
		await sendAndConfirm(connection, poolAuth, [...ataIxs, ix], [basisMint]);
	});

	it('Initialize Investor', async () => {
		const params: AddInvestmentParams = {
			weight: 1,
		};
		const ix = await basisProgram.methods
			.addInvestment(params)
			.accounts({
				investor,
				vault: protocolVault,
				authority: poolAuth.publicKey,
				pool,
				poolPayer,
				payer: poolAuth.publicKey,
				driftVaultsProgram: DRIFT_VAULTS_PROGRAM_ID,
			})
			.instruction();
		await sendAndConfirm(connection, poolAuth, [ix]);
		const investorAcct: VaultDepositor =
			await program.account.vaultDepositor.fetch(investor);
		assert(investorAcct.authority.equals(poolPayer));
	});

	it('Deposit', async () => {
		const createBasisAtaIxs = await createAtaIdempotent(
			connection,
			poolDepositor.publicKey,
			payer.publicKey,
			basisMint.publicKey
		);
		await sendAndConfirm(connection, payer, createBasisAtaIxs);

		const vaultAcct: Vault = await program.account.vault.fetch(protocolVault);
		const driftSpotMarket = adminClient.getSpotMarketAccount(0);
		assert.isDefined(driftSpotMarket);

		const poolDepositorUsdcBalance = await tokenBalance(
			connection,
			poolDepositorUsdcTokenAccount
		);
		assert.strictEqual(poolDepositorUsdcBalance, usdcUiAmount);

		const params: PoolDepositParams = {
			usdc: usdcAmount,
		};

		const remainingAccounts = poolClient.driftClient.getRemainingAccounts({
			userAccounts: [],
			writableSpotMarketIndexes: [0],
		});
		if (vaultAcct.vaultProtocol) {
			const vaultProtocol = getVaultProtocolAddressSync(
				managerClient.program.programId,
				protocolVault
			);
			remainingAccounts.push({
				pubkey: vaultProtocol,
				isSigner: false,
				isWritable: true,
			});
		}

		const ix = await basisProgram.methods
			.poolDeposit(params)
			.accounts({
				vault: protocolVault,
				investor,
				vaultTokenAccount: vaultAcct.tokenAccount,
				driftUserStats: vaultAcct.userStats,
				driftUser: vaultAcct.user,
				driftState: await adminClient.getStatePublicKey(),
				driftSpotMarketVault: driftSpotMarket.vault,
				poolDepositorUsdcTokenAccount,
				poolDepositorBasisTokenAccount,
				basisMint: basisMint.publicKey,
				poolDepositor: poolDepositor.publicKey,
				authority: poolAuth.publicKey,
				pool,
				poolPayer,
				poolPayerUsdcTokenAccount: poolPayerUsdcVault,
				payer: poolAuth.publicKey,
				driftVaultsProgram: DRIFT_VAULTS_PROGRAM_ID,
				driftProgram: DRIFT_PROGRAM_ID,
			})
			.remainingAccounts(remainingAccounts)
			.instruction();
		await sendAndConfirm(connection, poolAuth, [ix], [poolDepositor]);
		const poolAcct: Pool = await basisProgram.account.pool.fetch(pool);
		assert(poolAcct.deposits.eq(usdcAmount));
		assert(poolAcct.supply.eq(usdcAmount));
		assert(poolAcct.exchangeRate.eq(new BN(1)));
		const poolDepositorBasisBalance = await tokenBalance(
			connection,
			poolDepositorBasisTokenAccount
		);
		assert.strictEqual(poolDepositorBasisBalance, usdcUiAmount);
	});
});
