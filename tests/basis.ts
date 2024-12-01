import * as anchor from '@coral-xyz/anchor';
import {
	AdminClient,
	BASE_PRECISION,
	BN,
	BulkAccountLoader,
	calculatePositionPNL,
	getLimitOrderParams,
	getOrderParams,
	getUserAccountPublicKey,
	MarketType,
	OracleSource,
	PEG_PRECISION,
	PositionDirection,
	PostOnlyParams,
	PRICE_PRECISION,
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
	setFeedPrice,
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
	PoolWithdrawParams,
	RequestVaultWithdrawParams,
	TEST_MANAGER,
	TEST_USDC_DECIMALS,
	TEST_USDC_MINT,
	TEST_USDC_MINT_AUTHORITY,
} from '../ts/sdk';
import {
	createAtaIdempotent,
	createMintIxs,
	sendAndConfirm,
	simulate,
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
	const finalSolPerpPrice = initialSolPerpPrice + 10;
	const baseAssetAmount = new BN(50).mul(BASE_PRECISION);

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
		const deposits = poolAcct.deposits.toNumber() / QUOTE_PRECISION.toNumber();
		const supply = poolAcct.supply.toNumber() / QUOTE_PRECISION.toNumber();
		const exchangeRate =
			poolAcct.exchangeRate.toNumber() /
			QUOTE_PRECISION.toNumber() /
			QUOTE_PRECISION.toNumber();
		assert.strictEqual(deposits, usdcUiAmount);
		assert.strictEqual(supply, usdcUiAmount);
		assert.strictEqual(exchangeRate, 1);
		const poolDepositorBasisBalance = await tokenBalance(
			connection,
			poolDepositorBasisTokenAccount
		);
		assert.strictEqual(poolDepositorBasisBalance, usdcUiAmount);
	});

	// vault enters long
	it('Long SOL-PERP', async () => {
		// vault user account is delegated to "delegate"
		const vaultUserAcct = (
			await delegateClient.driftClient.getUserAccountsForDelegate(
				delegate.publicKey
			)
		)[0];
		assert(vaultUserAcct.authority.equals(protocolVault));
		assert(vaultUserAcct.delegate.equals(delegate.publicKey));

		assert(vaultUserAcct.totalDeposits.eq(usdcAmount));
		const balance =
			vaultUserAcct.totalDeposits.toNumber() / QUOTE_PRECISION.toNumber();
		assert.strictEqual(balance, usdcUiAmount);

		const marketIndex = 0;

		// delegate assumes control of vault user
		await delegateClient.driftClient.addUser(0, protocolVault, vaultUserAcct);
		await delegateClient.driftClient.switchActiveUser(0, protocolVault);

		const delegateActiveUser = delegateClient.driftClient.getUser(
			0,
			protocolVault
		);
		const vaultUserKey = await getUserAccountPublicKey(
			delegateClient.driftClient.program.programId,
			protocolVault,
			0
		);
		assert(
			delegateActiveUser.userAccountPublicKey.equals(vaultUserKey),
			'delegate active user is not vault user'
		);

		const fillerUser = fillerClient.driftClient.getUser();

		try {
			// manager places long order and waits to be filler by the filler
			const takerOrderParams = getLimitOrderParams({
				marketIndex,
				direction: PositionDirection.SHORT,
				baseAssetAmount,
				price: new BN((initialSolPerpPrice - 1) * PRICE_PRECISION.toNumber()),
				auctionStartPrice: new BN(
					initialSolPerpPrice * PRICE_PRECISION.toNumber()
				),
				auctionEndPrice: new BN(
					(initialSolPerpPrice - 1) * PRICE_PRECISION.toNumber()
				),
				auctionDuration: 10,
				userOrderId: 1,
				postOnly: PostOnlyParams.NONE,
			});
			await fillerClient.driftClient.placePerpOrder(takerOrderParams);
		} catch (e) {
			throw new Error(`filler failed to short: ${e}`);
		}
		await fillerUser.fetchAccounts();
		const order = fillerUser.getOrderByUserOrderId(1);
		if (!order) {
			throw new Error('filler order not found');
		}
		assert(!order.postOnly);

		try {
			// vault trades against filler's long
			const makerOrderParams = getLimitOrderParams({
				marketIndex,
				direction: PositionDirection.LONG,
				baseAssetAmount,
				price: new BN(initialSolPerpPrice).mul(PRICE_PRECISION),
				userOrderId: 1,
				postOnly: PostOnlyParams.MUST_POST_ONLY,
				immediateOrCancel: true,
			});
			const orderParams = getOrderParams(makerOrderParams, {
				marketType: MarketType.PERP,
			});
			const userStatsPublicKey =
				delegateClient.driftClient.getUserStatsAccountPublicKey();

			const remainingAccounts = delegateClient.driftClient.getRemainingAccounts(
				{
					userAccounts: [
						delegateActiveUser.getUserAccount(),
						fillerUser.getUserAccount(),
					],
					useMarketLastSlotCache: true,
					writablePerpMarketIndexes: [orderParams.marketIndex],
				}
			);

			const takerOrderId = order.orderId;
			const placeAndMakeOrderIx =
				await delegateClient.driftClient.program.methods
					.placeAndMakePerpOrder(orderParams, takerOrderId)
					.accounts({
						state: await delegateClient.driftClient.getStatePublicKey(),
						user: delegateActiveUser.userAccountPublicKey,
						userStats: userStatsPublicKey,
						taker: fillerUser.userAccountPublicKey,
						takerStats: fillerClient.driftClient.getUserStatsAccountPublicKey(),
						authority: delegateClient.driftClient.wallet.publicKey,
					})
					.remainingAccounts(remainingAccounts)
					.instruction();

			const { slot } = await delegateClient.driftClient.sendTransaction(
				await delegateClient.driftClient.buildTransaction(
					placeAndMakeOrderIx,
					delegateClient.driftClient.txParams
				),
				[],
				delegateClient.driftClient.opts
			);

			delegateClient.driftClient.perpMarketLastSlotCache.set(
				orderParams.marketIndex,
				slot
			);
		} catch (e) {
			throw new Error(`vault failed to long: ${e}`);
		}

		// check positions from vault and filler are accurate
		await fillerUser.fetchAccounts();
		const fillerPosition = fillerUser.getPerpPosition(0);
		if (!fillerPosition) {
			throw new Error('filler position not found');
		}
		assert(
			fillerPosition.baseAssetAmount.eq(baseAssetAmount.neg()),
			'filler position is not baseAssetAmount'
		);
		await delegateActiveUser.fetchAccounts();
		const vaultPosition = delegateActiveUser.getPerpPosition(0);
		if (!vaultPosition) {
			throw new Error('vault position not found');
		}
		assert(
			vaultPosition.baseAssetAmount.eq(baseAssetAmount),
			'vault position is not baseAssetAmount'
		);
	});

	// increase price of SOL perp by 5%
	it('Increase SOL-PERP Price', async () => {
		const preOD = adminClient.getOracleDataForPerpMarket(0);
		const priceBefore = preOD.price.toNumber() / PRICE_PRECISION.toNumber();
		assert(priceBefore === initialSolPerpPrice);

		try {
			// increase AMM
			await adminClient.moveAmmToPrice(
				0,
				new BN(finalSolPerpPrice * PRICE_PRECISION.toNumber())
			);
		} catch (e) {
			throw new Error(`failed to move amm price: ${e}`);
		}

		const solPerpMarket = adminClient.getPerpMarketAccount(0);
		if (!solPerpMarket) {
			throw new Error('SOL-PERP market not found');
		}

		await setFeedPrice(
			anchor.workspace.Pyth,
			finalSolPerpPrice,
			solPerpMarket.amm.oracle
		);

		const postOD = adminClient.getOracleDataForPerpMarket(0);
		const priceAfter = postOD.price.toNumber() / PRICE_PRECISION.toNumber();
		assert(priceAfter === finalSolPerpPrice);
	});

	// vault exits long for a profit
	it('Short SOL-PERP', async () => {
		const marketIndex = 0;

		const delegateActiveUser = delegateClient.driftClient.getUser(
			0,
			protocolVault
		);
		const fillerUser = fillerClient.driftClient.getUser();

		try {
			// manager places long order and waits to be filler by the filler
			const takerOrderParams = getLimitOrderParams({
				marketIndex,
				direction: PositionDirection.LONG,
				baseAssetAmount,
				price: new BN((finalSolPerpPrice + 1) * PRICE_PRECISION.toNumber()),
				auctionStartPrice: new BN(
					finalSolPerpPrice * PRICE_PRECISION.toNumber()
				),
				auctionEndPrice: new BN(
					(finalSolPerpPrice + 1) * PRICE_PRECISION.toNumber()
				),
				auctionDuration: 10,
				userOrderId: 1,
				postOnly: PostOnlyParams.NONE,
			});
			await fillerClient.driftClient.placePerpOrder(takerOrderParams);
		} catch (e) {
			throw new Error(`filler failed to long: ${e}`);
		}
		await fillerUser.fetchAccounts();
		const order = fillerUser.getOrderByUserOrderId(1);
		if (!order) {
			throw new Error('filler order not found');
		}
		assert(!order.postOnly);

		try {
			// vault trades against filler's long
			const makerOrderParams = getLimitOrderParams({
				marketIndex,
				direction: PositionDirection.SHORT,
				baseAssetAmount,
				price: new BN(finalSolPerpPrice).mul(PRICE_PRECISION),
				userOrderId: 1,
				postOnly: PostOnlyParams.MUST_POST_ONLY,
				immediateOrCancel: true,
			});
			const orderParams = getOrderParams(makerOrderParams, {
				marketType: MarketType.PERP,
			});
			const userStatsPublicKey =
				delegateClient.driftClient.getUserStatsAccountPublicKey();

			const remainingAccounts = delegateClient.driftClient.getRemainingAccounts(
				{
					userAccounts: [
						delegateActiveUser.getUserAccount(),
						fillerUser.getUserAccount(),
					],
					useMarketLastSlotCache: true,
					writablePerpMarketIndexes: [orderParams.marketIndex],
				}
			);

			const takerOrderId = order.orderId;
			const placeAndMakeOrderIx =
				await delegateClient.driftClient.program.methods
					.placeAndMakePerpOrder(orderParams, takerOrderId)
					.accounts({
						state: await delegateClient.driftClient.getStatePublicKey(),
						user: delegateActiveUser.userAccountPublicKey,
						userStats: userStatsPublicKey,
						taker: fillerUser.userAccountPublicKey,
						takerStats: fillerClient.driftClient.getUserStatsAccountPublicKey(),
						authority: delegateClient.driftClient.wallet.publicKey,
					})
					.remainingAccounts(remainingAccounts)
					.instruction();

			const { slot } = await delegateClient.driftClient.sendTransaction(
				await delegateClient.driftClient.buildTransaction(
					placeAndMakeOrderIx,
					delegateClient.driftClient.txParams
				),
				[],
				delegateClient.driftClient.opts
			);

			delegateClient.driftClient.perpMarketLastSlotCache.set(
				orderParams.marketIndex,
				slot
			);
		} catch (e) {
			throw new Error(`vault failed to short: ${e}`);
		}

		// check positions from vault and filler are accurate
		await fillerUser.fetchAccounts();
		const fillerPosition = fillerUser.getPerpPosition(0);
		if (!fillerPosition) {
			throw new Error('filler position not found');
		}
		assert(fillerPosition.baseAssetAmount.eq(ZERO));
		await delegateActiveUser.fetchAccounts();
		const vaultPosition = delegateActiveUser.getPerpPosition(0);
		if (!vaultPosition) {
			throw new Error('vault position not found');
		}
		assert(vaultPosition.baseAssetAmount.eq(ZERO));
	});

	it('Settle Pnl', async () => {
		const vaultUser = delegateClient.driftClient.getUser(0, protocolVault);
		const uA = vaultUser.getUserAccount();
		assert(!uA.idle);
		const solPerpPos = vaultUser.getPerpPosition(0);
		if (!solPerpPos) {
			throw new Error('position not found');
		}
		const solPerpQuote =
			solPerpPos.quoteAssetAmount.toNumber() / QUOTE_PRECISION.toNumber();
		assert(solPerpPos.baseAssetAmount.eq(ZERO));
		assert(usdcAmount.eq(vaultUser.getFreeCollateral()));

		const solPrice = vaultUser.driftClient.getOracleDataForPerpMarket(0);
		assert(
			finalSolPerpPrice ===
				solPrice.price.toNumber() / PRICE_PRECISION.toNumber()
		);

		const solPerpMarket = delegateClient.driftClient.getPerpMarketAccount(0);
		if (!solPerpMarket) {
			throw new Error('SOL-PERP market not found');
		}
		const pnl =
			calculatePositionPNL(
				solPerpMarket,
				solPerpPos,
				false,
				solPrice
			).toNumber() / QUOTE_PRECISION.toNumber();
		console.log('pnl:', pnl);
		// assert.strictEqual(pnl, 502.058334);

		const upnl =
			vaultUser.getUnrealizedPNL().toNumber() / QUOTE_PRECISION.toNumber();
		assert(pnl === upnl);
		assert(
			solPerpPos.quoteAssetAmount.toNumber() / QUOTE_PRECISION.toNumber() ===
				upnl
		);
		assert(solPerpQuote === pnl);

		await vaultUser.fetchAccounts();
		try {
			// settle market maker who lost trade and pays taker fees
			await delegateClient.driftClient.settlePNL(
				fillerUser.userAccountPublicKey,
				fillerUser.getUserAccount(),
				0
			);
			// then settle vault who won trade and earns maker fees
			await delegateClient.driftClient.settlePNL(
				vaultUser.userAccountPublicKey,
				vaultUser.getUserAccount(),
				0
			);
		} catch (e) {
			throw new Error(`failed to settle pnl: ${e}`);
		}

		// vault user account is delegated to "delegate"
		const vaultUserAcct = delegateClient.driftClient
			.getUser(0, protocolVault)
			.getUserAccount();
		const settledPnl =
			vaultUserAcct.settledPerpPnl.toNumber() / QUOTE_PRECISION.toNumber();
		console.log('settledPnl:', settledPnl);
		assert(settledPnl === pnl);
	});

	it('Request Distribute Yield', async () => {
		const vaultAcct: Vault = await program.account.vault.fetch(protocolVault);
		const driftSpotMarket = adminClient.getSpotMarketAccount(0);
		assert.isDefined(driftSpotMarket);

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
			.requestDistributeYield()
			.accounts({
				vault: protocolVault,
				investor,
				driftUserStats: vaultAcct.userStats,
				driftUser: vaultAcct.user,
				driftState: await adminClient.getStatePublicKey(),
				pool,
				authority: poolAuth.publicKey,
				poolPayer,
				payer: poolAuth.publicKey,
				driftVaultsProgram: DRIFT_VAULTS_PROGRAM_ID,
			})
			.remainingAccounts(remainingAccounts)
			.instruction();
		await sendAndConfirm(connection, poolAuth, [ix]);

		const investorAcct: VaultDepositor =
			await program.account.vaultDepositor.fetch(investor);
		const wdr = investorAcct.lastWithdrawRequest.value;
		console.log('wdr', wdr.toNumber());
		// assert.strictEqual(wdr.toNumber(), 451852500);
	});

	it('Distribute Yield', async () => {
		const vaultAcct: Vault = await program.account.vault.fetch(protocolVault);
		const driftSpotMarket = adminClient.getSpotMarketAccount(0);
		assert.isDefined(driftSpotMarket);

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
			.distributeYield()
			.accounts({
				vault: protocolVault,
				investor,
				vaultTokenAccount: vaultAcct.tokenAccount,
				driftUserStats: vaultAcct.userStats,
				driftUser: vaultAcct.user,
				driftState: await adminClient.getStatePublicKey(),
				driftSpotMarketVault: driftSpotMarket.vault,
				driftSigner: adminClient.getStateAccount().signer,
				poolPayerUsdcTokenAccount: poolPayerUsdcVault,
				poolUsdcTokenAccount: poolUsdcVault,
				pool,
				authority: poolAuth.publicKey,
				poolPayer,
				payer: poolAuth.publicKey,
				driftVaultsProgram: DRIFT_VAULTS_PROGRAM_ID,
				driftProgram: DRIFT_PROGRAM_ID,
			})
			.remainingAccounts(remainingAccounts)
			.instruction();
		await sendAndConfirm(connection, poolAuth, [ix]);

		const poolUsdc = await tokenBalance(connection, poolUsdcVault);
		console.log('poolUsdc:', poolUsdc);
		assert.strictEqual(poolUsdc, 451.852499);

		const poolAcct: Pool = await basisProgram.account.pool.fetch(pool);
		const deposits = poolAcct.deposits.toNumber() / QUOTE_PRECISION.toNumber();
		const supply = poolAcct.supply.toNumber() / QUOTE_PRECISION.toNumber();
		const exchangeRate =
			poolAcct.exchangeRate.toNumber() /
			QUOTE_PRECISION.toNumber() /
			QUOTE_PRECISION.toNumber();
		assert.strictEqual(deposits, usdcUiAmount + poolUsdc);
		assert.strictEqual(supply, usdcUiAmount);
		assert.strictEqual(exchangeRate, 1.00903704998);
	});

	it('Request Vault Withdraw', async () => {
		const vaultAcct: Vault = await program.account.vault.fetch(protocolVault);
		const driftSpotMarket = adminClient.getSpotMarketAccount(0);
		assert.isDefined(driftSpotMarket);

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
		const basisBalance = await tokenBalance(
			connection,
			poolDepositorBasisTokenAccount
		);
		const params: RequestVaultWithdrawParams = {
			basis: new BN(basisBalance * QUOTE_PRECISION.toNumber()),
		};
		const ix = await basisProgram.methods
			.requestVaultWithdraw(params)
			.accounts({
				vault: protocolVault,
				investor,
				driftUserStats: vaultAcct.userStats,
				driftUser: vaultAcct.user,
				driftState: await adminClient.getStatePublicKey(),
				driftVaultsProgram: DRIFT_VAULTS_PROGRAM_ID,
				poolDepositor: poolDepositor.publicKey,
				poolDepositorBasisTokenAccount,
				poolUsdcTokenAccount: poolUsdcVault,
				pool,
				poolPayer,
			})
			.remainingAccounts(remainingAccounts)
			.instruction();
		await sendAndConfirm(connection, poolDepositor, [ix]);
	});

	it('Vault Withdraw', async () => {
		const vaultAcct: Vault = await program.account.vault.fetch(protocolVault);
		const driftSpotMarket = adminClient.getSpotMarketAccount(0);
		assert.isDefined(driftSpotMarket);

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
			.vaultWithdraw()
			.accounts({
				vault: protocolVault,
				investor,
				vaultTokenAccount: vaultAcct.tokenAccount,
				driftUserStats: vaultAcct.userStats,
				driftUser: vaultAcct.user,
				driftState: await adminClient.getStatePublicKey(),
				driftSpotMarketVault: driftSpotMarket.vault,
				driftSigner: adminClient.getStateAccount().signer,
				driftVaultsProgram: DRIFT_VAULTS_PROGRAM_ID,
				driftProgram: DRIFT_PROGRAM_ID,
				poolUsdcTokenAccount: poolUsdcVault,
				pool,
				poolPayerUsdcTokenAccount: poolPayerUsdcVault,
				poolPayer,
			})
			.remainingAccounts(remainingAccounts)
			.instruction();
		await sendAndConfirm(connection, poolDepositor, [ix]);
	});

	it('Pool Withdraw', async () => {
		const poolUsdcBefore = await tokenBalance(connection, poolUsdcVault);
		console.log('pool usdc before withdraw:', poolUsdcBefore);
		assert.strictEqual(poolUsdcBefore, 50451.852498);

		const basisBalance = await tokenBalance(
			connection,
			poolDepositorBasisTokenAccount
		);
		const params: PoolWithdrawParams = {
			basis: new BN(basisBalance * QUOTE_PRECISION.toNumber()),
		};
		const ix = await basisProgram.methods
			.poolWithdraw(params)
			.accounts({
				poolDepositor: poolDepositor.publicKey,
				poolDepositorUsdcTokenAccount,
				poolDepositorBasisTokenAccount,
				basisMint: basisMint.publicKey,
				pool,
				poolPayer,
				poolUsdcTokenAccount: poolUsdcVault,
			})
			.instruction();
		await sendAndConfirm(connection, poolDepositor, [ix]);

		const poolUsdcAfter = await tokenBalance(connection, poolUsdcVault);
		const poolAcct: Pool = await basisProgram.account.pool.fetch(pool);
		const deposits = poolAcct.deposits.toNumber() / QUOTE_PRECISION.toNumber();
		const supply = poolAcct.supply.toNumber() / QUOTE_PRECISION.toNumber();
		const exchangeRate =
			poolAcct.exchangeRate.toNumber() /
			QUOTE_PRECISION.toNumber() /
			QUOTE_PRECISION.toNumber();
		console.log('pool usdc:', poolUsdcAfter);
		console.log('deposits:', deposits);
		console.log('supply:', supply);
		console.log('exr:', exchangeRate);
		assert.strictEqual(deposits, 0);
		assert.strictEqual(supply, 0);
		assert.strictEqual(exchangeRate, 1);
	});
});
