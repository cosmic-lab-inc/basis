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
	Investment,
	Pool,
	PoolDepositParams,
	PoolWithdrawParams,
	TEST_MANAGER,
	TEST_USDC_DECIMALS,
	TEST_USDC_MINT,
	TEST_USDC_MINT_AUTHORITY,
	VaultImmediateWithdrawParams,
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

	const vault1Name = 'Vault 1';
	const vault1 = getVaultAddressSync(program.programId, encodeName(vault1Name));
	const vault2Name = 'Vault 2';
	const vault2 = getVaultAddressSync(program.programId, encodeName(vault2Name));

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

	const investor1 = getVaultDepositorAddressSync(
		DRIFT_VAULTS_PROGRAM_ID,
		vault1,
		poolPayer
	);
	const investor2 = getVaultDepositorAddressSync(
		DRIFT_VAULTS_PROGRAM_ID,
		vault2,
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

		// depositing into vault1 and vault2, so needs twice the usdc amount
		const bootstrapPoolDepositor = await bootstrapSignerClientAndUser({
			payer: provider,
			programId: program.programId,
			usdcMint,
			usdcMintAuth,
			usdcAmount: usdcAmount.mul(new BN(2)),
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

	it('Initialize Vault 1', async () => {
		const vpParams: VaultProtocolParams = {
			protocol: protocol.publicKey,
			protocolFee: new BN(0),
			// 100_000 = 10%
			protocolProfitShare: 100_000,
		};
		await managerClient.initializeVault({
			name: encodeName(vault1Name),
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
		const vaultAcct = await program.account.vault.fetch(vault1);
		assert(vaultAcct.manager.equals(manager.publicKey));
		const vp = getVaultProtocolAddressSync(
			managerClient.program.programId,
			vault1
		);
		// asserts "exit" was called on VaultProtocol to define the discriminator
		const vpAcctInfo = await connection.getAccountInfo(vp);
		assert(vpAcctInfo !== null);
		// asserts Vault and VaultProtocol fields were set properly
		assert(vaultAcct.vaultProtocol);
		const vpAcct = await program.account.vaultProtocol.fetch(vp);
		assert(vpAcct.protocol.equals(protocol.publicKey));
	});

	it('Update Vault 1 Delegate', async () => {
		const vaultAccount = await program.account.vault.fetch(vault1);
		await managerClient.program.methods
			.updateDelegate(delegate.publicKey)
			.accounts({
				vault: vault1,
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

	it('Add Investment for Vault 1', async () => {
		const params: AddInvestmentParams = {
			weight: 300_000,
		};
		const ix = await basisProgram.methods
			.addInvestment(params)
			.accounts({
				investor: investor1,
				vault: vault1,
				authority: poolAuth.publicKey,
				pool,
				poolPayer,
				payer: poolAuth.publicKey,
				driftVaultsProgram: DRIFT_VAULTS_PROGRAM_ID,
			})
			.instruction();
		await simulate(connection, poolAuth, [ix]);
		await sendAndConfirm(connection, poolAuth, [ix]);

		const investorAcct: VaultDepositor =
			await program.account.vaultDepositor.fetch(investor1);
		assert(investorAcct.authority.equals(poolPayer));
		const poolAcct: Pool = await basisProgram.account.pool.fetch(pool);
		const investmentState = poolAcct.investments[0];
		assert.strictEqual(investmentState.weight, 1_000_000);
	});

	it('Deposit for Vault 1', async () => {
		const createBasisAtaIxs = await createAtaIdempotent(
			connection,
			poolDepositor.publicKey,
			payer.publicKey,
			basisMint.publicKey
		);
		await sendAndConfirm(connection, payer, createBasisAtaIxs);

		const vaultAcct: Vault = await program.account.vault.fetch(vault1);
		const driftSpotMarket = adminClient.getSpotMarketAccount(0);
		assert.isDefined(driftSpotMarket);

		const poolDepositorUsdcBalance = await tokenBalance(
			connection,
			poolDepositorUsdcTokenAccount
		);
		assert.strictEqual(poolDepositorUsdcBalance, usdcUiAmount * 2);

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
				vault1
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
				vault: vault1,
				investor: investor1,
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
		assert(vaultUserAcct.authority.equals(vault1));
		assert(vaultUserAcct.delegate.equals(delegate.publicKey));

		assert(vaultUserAcct.totalDeposits.eq(usdcAmount));
		const balance =
			vaultUserAcct.totalDeposits.toNumber() / QUOTE_PRECISION.toNumber();
		assert.strictEqual(balance, usdcUiAmount);

		const marketIndex = 0;

		// delegate assumes control of vault user
		await delegateClient.driftClient.addUser(0, vault1, vaultUserAcct);
		await delegateClient.driftClient.switchActiveUser(0, vault1);

		const delegateActiveUser = delegateClient.driftClient.getUser(0, vault1);
		const vaultUserKey = await getUserAccountPublicKey(
			delegateClient.driftClient.program.programId,
			vault1,
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

		const delegateActiveUser = delegateClient.driftClient.getUser(0, vault1);
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
		const vaultUser = delegateClient.driftClient.getUser(0, vault1);
		const uA = vaultUser.getUserAccount();
		assert(!uA.idle);
		const solPerpPos = vaultUser.getPerpPosition(0);
		if (!solPerpPos) {
			throw new Error('position not found');
		}
		const solPerpQuote =
			solPerpPos.quoteAssetAmount.toNumber() / QUOTE_PRECISION.toNumber();
		assert.strictEqual(solPerpPos.baseAssetAmount.toNumber(), 0);
		assert.strictEqual(
			usdcAmount.toNumber(),
			vaultUser.getFreeCollateral().toNumber()
		);

		const solPrice = vaultUser.driftClient.getOracleDataForPerpMarket(0);
		assert.strictEqual(
			finalSolPerpPrice,
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
		assert.strictEqual(pnl, 502.058334);

		const upnl =
			vaultUser.getUnrealizedPNL().toNumber() / QUOTE_PRECISION.toNumber();
		assert.strictEqual(pnl, upnl);
		assert.strictEqual(
			solPerpPos.quoteAssetAmount.toNumber() / QUOTE_PRECISION.toNumber(),
			upnl
		);
		assert.strictEqual(solPerpQuote, pnl);

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
			.getUser(0, vault1)
			.getUserAccount();
		const settledPnl =
			vaultUserAcct.settledPerpPnl.toNumber() / QUOTE_PRECISION.toNumber();
		assert.strictEqual(settledPnl, pnl);
	});

	it('Distribute Yield', async () => {
		const vaultAcct: Vault = await program.account.vault.fetch(vault1);
		const driftSpotMarket = adminClient.getSpotMarketAccount(0);
		assert.isDefined(driftSpotMarket);

		const remainingAccounts = poolClient.driftClient.getRemainingAccounts({
			userAccounts: [],
			writableSpotMarketIndexes: [0],
		});
		if (vaultAcct.vaultProtocol) {
			const vaultProtocol = getVaultProtocolAddressSync(
				managerClient.program.programId,
				vault1
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
				vault: vault1,
				investor: investor1,
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

	it('Initialize Vault 2', async () => {
		const vpParams: VaultProtocolParams = {
			protocol: protocol.publicKey,
			protocolFee: new BN(0),
			// 100_000 = 10%
			protocolProfitShare: 100_000,
		};
		await managerClient.initializeVault({
			name: encodeName(vault2Name),
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
		const vaultAcct = await program.account.vault.fetch(vault1);
		assert(vaultAcct.manager.equals(manager.publicKey));
		const vp = getVaultProtocolAddressSync(
			managerClient.program.programId,
			vault2
		);
		// asserts "exit" was called on VaultProtocol to define the discriminator
		const vpAcctInfo = await connection.getAccountInfo(vp);
		assert(vpAcctInfo !== null);
		// asserts Vault and VaultProtocol fields were set properly
		assert(vaultAcct.vaultProtocol);
		const vpAcct = await program.account.vaultProtocol.fetch(vp);
		assert(vpAcct.protocol.equals(protocol.publicKey));
	});

	it('Update Vault 2 Delegate', async () => {
		const vaultAccount = await program.account.vault.fetch(vault2);
		await managerClient.program.methods
			.updateDelegate(delegate.publicKey)
			.accounts({
				vault: vault2,
				driftUser: vaultAccount.user,
				driftProgram: adminClient.program.programId,
			})
			.rpc();
		const user = (await adminClient.program.account.user.fetch(
			vaultAccount.user
		)) as UserAccount;
		assert(user.delegate.equals(delegate.publicKey));
	});

	it('Add Investment for Vault 2', async () => {
		const params: AddInvestmentParams = {
			weight: 300_000,
		};
		const ix = await basisProgram.methods
			.addInvestment(params)
			.accounts({
				investor: investor2,
				vault: vault2,
				authority: poolAuth.publicKey,
				pool,
				poolPayer,
				payer: poolAuth.publicKey,
				driftVaultsProgram: DRIFT_VAULTS_PROGRAM_ID,
			})
			.instruction();
		await simulate(connection, poolAuth, [ix]);
		await sendAndConfirm(connection, poolAuth, [ix]);

		const investorAcct: VaultDepositor =
			await program.account.vaultDepositor.fetch(investor2);
		assert(investorAcct.authority.equals(poolPayer));
		const poolAcct: Pool = await basisProgram.account.pool.fetch(pool);
		const investment1 = poolAcct.investments[0];
		const investment2 = poolAcct.investments[1];
		console.log('investment 1 weight:', investment1.weight);
		console.log('investment 2 weight:', investment2.weight);
		assert.strictEqual(investment1.weight, 700_000);
		assert.strictEqual(investment2.weight, 300_000);
	});

	it('Deposit for Vault 2', async () => {
		const createBasisAtaIxs = await createAtaIdempotent(
			connection,
			poolDepositor.publicKey,
			payer.publicKey,
			basisMint.publicKey
		);
		await sendAndConfirm(connection, payer, createBasisAtaIxs);

		const vaultAcct: Vault = await program.account.vault.fetch(vault2);
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
				vault2
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
				vault: vault2,
				investor: investor2,
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

		const poolDepositorBasisBalance = await tokenBalance(
			connection,
			poolDepositorBasisTokenAccount
		);
		const poolAcct: Pool = await basisProgram.account.pool.fetch(pool);
		const deposits = poolAcct.deposits.toNumber() / QUOTE_PRECISION.toNumber();
		const supply = poolAcct.supply.toNumber() / QUOTE_PRECISION.toNumber();
		const exr =
			poolAcct.exchangeRate.toNumber() /
			QUOTE_PRECISION.toNumber() /
			QUOTE_PRECISION.toNumber();
		// console.log('poolDepositorBasisBalance:', poolDepositorBasisBalance);
		// console.log('deposits:', deposits);
		// console.log('supply:', supply);
		// console.log('exr:', exr);
		assert.strictEqual(poolDepositorBasisBalance, 99552.194343);
		assert.strictEqual(deposits, 100451.852499);
		assert.strictEqual(supply, 99552.194343);
		assert.strictEqual(exr, 1.009037049981);
	});

	it('Vault Immediate Withdraw', async () => {
		const vaultAcct: Vault = await program.account.vault.fetch(vault1);
		const driftSpotMarket = adminClient.getSpotMarketAccount(0);
		assert.isDefined(driftSpotMarket);

		const remainingAccounts = poolClient.driftClient.getRemainingAccounts({
			userAccounts: [],
			writableSpotMarketIndexes: [0],
		});
		if (vaultAcct.vaultProtocol) {
			const vaultProtocol = getVaultProtocolAddressSync(
				managerClient.program.programId,
				vault1
			);
			remainingAccounts.push({
				pubkey: vaultProtocol,
				isSigner: false,
				isWritable: true,
			});
		}
		const params: VaultImmediateWithdrawParams = {
			usdc: new BN(usdcUiAmount * QUOTE_PRECISION.toNumber()),
		};
		const ix = await basisProgram.methods
			.vaultImmediateWithdraw(params)
			.accounts({
				vault: vault1,
				investor: investor1,
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
				poolPayer,
				poolPayerUsdcTokenAccount: poolPayerUsdcVault,
				payer: poolAuth.publicKey,
			})
			.remainingAccounts(remainingAccounts)
			.instruction();
		await sendAndConfirm(connection, poolAuth, [ix]);
	});

	it('Pool Withdraw', async () => {
		const poolUsdcBefore = await tokenBalance(connection, poolUsdcVault);
		assert.strictEqual(poolUsdcBefore, 50451.852498);

		const basisToRedeem = usdcUiAmount;
		const params: PoolWithdrawParams = {
			basis: new BN(basisToRedeem * QUOTE_PRECISION.toNumber()),
		};
		const ix = await basisProgram.methods
			.poolWithdraw(params)
			.accounts({
				investor: investor1,
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
		const exr =
			poolAcct.exchangeRate.toNumber() /
			QUOTE_PRECISION.toNumber() /
			QUOTE_PRECISION.toNumber();
		// console.log('poolUsdcAfter:', poolUsdcAfter);
		// console.log('deposits:', deposits);
		// console.log('supply:', supply);
		// console.log('exr:', exr);
		assert.strictEqual(poolUsdcAfter, 0);
		assert.strictEqual(deposits, usdcUiAmount);
		assert.strictEqual(supply, 49552.194343);
		assert.strictEqual(exr, 1.009037049982);
	});

	it('Rebalance Vault 2', async () => {
		const vaultAcct: Vault = await program.account.vault.fetch(vault2);
		const driftSpotMarket = adminClient.getSpotMarketAccount(0);
		assert.isDefined(driftSpotMarket);

		const remainingAccounts = poolClient.driftClient.getRemainingAccounts({
			userAccounts: [],
			writableSpotMarketIndexes: [0],
		});
		if (vaultAcct.vaultProtocol) {
			const vaultProtocol = getVaultProtocolAddressSync(
				managerClient.program.programId,
				vault2
			);
			remainingAccounts.push({
				pubkey: vaultProtocol,
				isSigner: false,
				isWritable: true,
			});
		}

		const ix = await basisProgram.methods
			.rebalance()
			.accounts({
				vault: vault2,
				investor: investor2,
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
				poolPayer,
				poolPayerUsdcTokenAccount: poolPayerUsdcVault,
				payer: poolAuth.publicKey,
			})
			.remainingAccounts(remainingAccounts)
			.instruction();
		await sendAndConfirm(connection, poolAuth, [ix]);

		const poolUsdc = await tokenBalance(connection, poolUsdcVault);
		const poolPayerUsdc = await tokenBalance(connection, poolPayerUsdcVault);
		const poolAcct: Pool = await basisProgram.account.pool.fetch(pool);
		const deposits = poolAcct.deposits.toNumber() / QUOTE_PRECISION.toNumber();
		const supply = poolAcct.supply.toNumber() / QUOTE_PRECISION.toNumber();
		const exr =
			poolAcct.exchangeRate.toNumber() /
			QUOTE_PRECISION.toNumber() /
			QUOTE_PRECISION.toNumber();
		const investment: Investment = poolAcct.investments[1];
		console.log('poolUsdc:', poolUsdc);
		console.log('poolPayerUsdc:', poolPayerUsdc);
		console.log('deposits:', deposits);
		console.log('supply:', supply);
		console.log('exr:', exr);
		console.log('weight:', investment.weight);
		// assert.strictEqual(poolUsdcAfter, 0);
		// assert.strictEqual(deposits, usdcUiAmount);
		// assert.strictEqual(supply, 49552.194343);
		// assert.strictEqual(exr, 1.009037049982);
	});

	it('Rebalance Vault 1', async () => {
		const vaultAcct: Vault = await program.account.vault.fetch(vault1);
		const driftSpotMarket = adminClient.getSpotMarketAccount(0);
		assert.isDefined(driftSpotMarket);

		const remainingAccounts = poolClient.driftClient.getRemainingAccounts({
			userAccounts: [],
			writableSpotMarketIndexes: [0],
		});
		if (vaultAcct.vaultProtocol) {
			const vaultProtocol = getVaultProtocolAddressSync(
				managerClient.program.programId,
				vault1
			);
			remainingAccounts.push({
				pubkey: vaultProtocol,
				isSigner: false,
				isWritable: true,
			});
		}

		const ix = await basisProgram.methods
			.rebalance()
			.accounts({
				vault: vault1,
				investor: investor1,
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
				poolPayer,
				poolPayerUsdcTokenAccount: poolPayerUsdcVault,
				payer: poolAuth.publicKey,
			})
			.remainingAccounts(remainingAccounts)
			.instruction();
		await sendAndConfirm(connection, poolAuth, [ix]);

		const poolUsdc = await tokenBalance(connection, poolUsdcVault);
		const poolPayerUsdc = await tokenBalance(connection, poolPayerUsdcVault);
		const poolAcct: Pool = await basisProgram.account.pool.fetch(pool);
		const deposits = poolAcct.deposits.toNumber() / QUOTE_PRECISION.toNumber();
		const supply = poolAcct.supply.toNumber() / QUOTE_PRECISION.toNumber();
		const exr =
			poolAcct.exchangeRate.toNumber() /
			QUOTE_PRECISION.toNumber() /
			QUOTE_PRECISION.toNumber();
		const investment: Investment = poolAcct.investments[0];
		console.log('poolUsdc:', poolUsdc);
		console.log('poolPayerUsdc:', poolPayerUsdc);
		console.log('deposits:', deposits);
		console.log('supply:', supply);
		console.log('exr:', exr);
		console.log('weight:', investment.weight);
		// assert.strictEqual(poolUsdcAfter, 0);
		// assert.strictEqual(deposits, usdcUiAmount);
		// assert.strictEqual(supply, 49552.194343);
		// assert.strictEqual(exr, 1.009037049982);
	});
});
