export type Basis = {
	version: '0.1.0';
	name: 'basis';
	instructions: [
		{
			name: 'initializeFundTracker';
			accounts: [
				{
					name: 'authority';
					isMut: false;
					isSigner: true;
					docs: ['Admin-level keypair'];
				},
				{
					name: 'fundTracker';
					isMut: true;
					isSigner: false;
				},
				{
					name: 'payer';
					isMut: true;
					isSigner: true;
				},
				{
					name: 'rent';
					isMut: false;
					isSigner: false;
				},
				{
					name: 'systemProgram';
					isMut: false;
					isSigner: false;
				}
			];
			args: [];
		}
	];
	accounts: [
		{
			name: 'fundTracker';
			type: {
				kind: 'struct';
				fields: [
					{
						name: 'pool';
						docs: ['The pool that has an allocation/weight to this fund'];
						type: 'publicKey';
					},
					{
						name: 'fundTokenMint';
						docs: ["Mint of fund's tokenized shares"];
						type: 'publicKey';
					},
					{
						name: 'fundTokenAccount';
						docs: ['Authority is the [`FundTracker`] PDA'];
						type: 'publicKey';
					},
					{
						name: 'authority';
						docs: ['Authority who can sign to modify this account'];
						type: 'publicKey';
					},
					{
						name: 'lastUpdateTs';
						docs: ['Last time the program checked for yield to distribute'];
						type: 'u64';
					},
					{
						name: 'weight';
						docs: [
							"Basis points of the fund's weight in the pool (10_000 = 100%, 1 = 0.01%)"
						];
						type: 'u32';
					},
					{
						name: 'bump';
						type: 'u8';
					},
					{
						name: 'padding';
						type: {
							array: ['u8', 3];
						};
					}
				];
			};
		}
	];
	errors: [
		{
			code: 6000;
			name: 'Default';
			msg: 'Default';
		},
		{
			code: 6001;
			name: 'InvalidVaultRebase';
			msg: 'InvalidVaultRebase';
		},
		{
			code: 6002;
			name: 'InvalidVaultSharesDetected';
			msg: 'InvalidVaultSharesDetected';
		},
		{
			code: 6003;
			name: 'CannotWithdrawBeforeRedeemPeriodEnd';
			msg: 'CannotWithdrawBeforeRedeemPeriodEnd';
		},
		{
			code: 6004;
			name: 'InvalidVaultWithdraw';
			msg: 'InvalidVaultWithdraw';
		},
		{
			code: 6005;
			name: 'InsufficientVaultShares';
			msg: 'InsufficientVaultShares';
		},
		{
			code: 6006;
			name: 'InvalidVaultWithdrawSize';
			msg: 'InvalidVaultWithdrawSize';
		},
		{
			code: 6007;
			name: 'InvalidVaultForNewDepositors';
			msg: 'InvalidVaultForNewDepositors';
		},
		{
			code: 6008;
			name: 'VaultWithdrawRequestInProgress';
			msg: 'VaultWithdrawRequestInProgress';
		},
		{
			code: 6009;
			name: 'VaultIsAtCapacity';
			msg: 'VaultIsAtCapacity';
		},
		{
			code: 6010;
			name: 'InvalidVaultDepositorInitialization';
			msg: 'InvalidVaultDepositorInitialization';
		},
		{
			code: 6011;
			name: 'DelegateNotAvailableForLiquidation';
			msg: 'DelegateNotAvailableForLiquidation';
		},
		{
			code: 6012;
			name: 'InvalidLiquidator';
			msg: 'InvalidLiquidator';
		},
		{
			code: 6013;
			name: 'LiquidationExpired';
			msg: 'LiquidationExpired';
		},
		{
			code: 6014;
			name: 'InvalidEquityValue';
			msg: 'InvalidEquityValue';
		},
		{
			code: 6015;
			name: 'VaultInLiquidation';
			msg: 'VaultInLiquidation';
		},
		{
			code: 6016;
			name: 'InvestorCanWithdraw';
			msg: 'InvestorCanWithdraw';
		},
		{
			code: 6017;
			name: 'InvalidVaultInitialization';
			msg: 'InvalidVaultInitialization';
		},
		{
			code: 6018;
			name: 'InvalidVaultUpdate';
			msg: 'InvalidVaultUpdate';
		},
		{
			code: 6019;
			name: 'PermissionedVault';
			msg: 'PermissionedVault';
		},
		{
			code: 6020;
			name: 'WithdrawInProgress';
			msg: 'WithdrawInProgress';
		},
		{
			code: 6021;
			name: 'SharesPercentTooLarge';
			msg: 'SharesPercentTooLarge';
		},
		{
			code: 6022;
			name: 'InvalidVaultDeposit';
			msg: 'InvalidVaultDeposit';
		},
		{
			code: 6023;
			name: 'OngoingLiquidation';
			msg: 'OngoingLiquidation';
		},
		{
			code: 6024;
			name: 'VaultProtocolMissing';
			msg: 'VaultProtocolMissing';
		},
		{
			code: 6025;
			name: 'BnConversion';
			msg: 'BnConversion';
		},
		{
			code: 6026;
			name: 'MathError';
			msg: 'MathError';
		},
		{
			code: 6027;
			name: 'CastError';
			msg: 'CastError';
		},
		{
			code: 6028;
			name: 'UnwrapError';
			msg: 'UnwrapError';
		},
		{
			code: 6029;
			name: 'MarketDeserializationError';
			msg: 'MarketDeserializationError';
		},
		{
			code: 6030;
			name: 'UnrecognizedQuoteMint';
			msg: 'UnrecognizedQuoteMint';
		},
		{
			code: 6031;
			name: 'SolMarketMissing';
			msg: 'SolMarketMissing';
		},
		{
			code: 6032;
			name: 'MarketMissingInRemainingAccounts';
			msg: 'MarketMissingInRemainingAccounts';
		},
		{
			code: 6033;
			name: 'MarketRegistryMismatch';
			msg: 'MarketRegistryMismatch';
		},
		{
			code: 6034;
			name: 'OrderPacketDeserialization';
			msg: 'OrderPacketDeserialization';
		},
		{
			code: 6035;
			name: 'OrderPacketMustUseDepositedFunds';
			msg: 'OrderPacketMustUseDepositedFunds';
		},
		{
			code: 6036;
			name: 'InvalidPhoenixInstruction';
			msg: 'InvalidPhoenixInstruction';
		},
		{
			code: 6037;
			name: 'OrderPacketMustBeTakeOnly';
			msg: 'OrderPacketMustBeTakeOnly';
		},
		{
			code: 6038;
			name: 'BaseLotsMustBeZero';
			msg: 'BaseLotsMustBeZero';
		},
		{
			code: 6039;
			name: 'TraderStateNotFound';
			msg: 'TraderStateNotFound';
		},
		{
			code: 6040;
			name: 'MarketPositionNotFound';
			msg: 'MarketPositionNotFound';
		}
	];
};

export const IDL: Basis = {
	version: '0.1.0',
	name: 'basis',
	instructions: [
		{
			name: 'initializeFundTracker',
			accounts: [
				{
					name: 'authority',
					isMut: false,
					isSigner: true,
					docs: ['Admin-level keypair'],
				},
				{
					name: 'fundTracker',
					isMut: true,
					isSigner: false,
				},
				{
					name: 'payer',
					isMut: true,
					isSigner: true,
				},
				{
					name: 'rent',
					isMut: false,
					isSigner: false,
				},
				{
					name: 'systemProgram',
					isMut: false,
					isSigner: false,
				},
			],
			args: [],
		},
	],
	accounts: [
		{
			name: 'fundTracker',
			type: {
				kind: 'struct',
				fields: [
					{
						name: 'pool',
						docs: ['The pool that has an allocation/weight to this fund'],
						type: 'publicKey',
					},
					{
						name: 'fundTokenMint',
						docs: ["Mint of fund's tokenized shares"],
						type: 'publicKey',
					},
					{
						name: 'fundTokenAccount',
						docs: ['Authority is the [`FundTracker`] PDA'],
						type: 'publicKey',
					},
					{
						name: 'authority',
						docs: ['Authority who can sign to modify this account'],
						type: 'publicKey',
					},
					{
						name: 'lastUpdateTs',
						docs: ['Last time the program checked for yield to distribute'],
						type: 'u64',
					},
					{
						name: 'weight',
						docs: [
							"Basis points of the fund's weight in the pool (10_000 = 100%, 1 = 0.01%)",
						],
						type: 'u32',
					},
					{
						name: 'bump',
						type: 'u8',
					},
					{
						name: 'padding',
						type: {
							array: ['u8', 3],
						},
					},
				],
			},
		},
	],
	errors: [
		{
			code: 6000,
			name: 'Default',
			msg: 'Default',
		},
		{
			code: 6001,
			name: 'InvalidVaultRebase',
			msg: 'InvalidVaultRebase',
		},
		{
			code: 6002,
			name: 'InvalidVaultSharesDetected',
			msg: 'InvalidVaultSharesDetected',
		},
		{
			code: 6003,
			name: 'CannotWithdrawBeforeRedeemPeriodEnd',
			msg: 'CannotWithdrawBeforeRedeemPeriodEnd',
		},
		{
			code: 6004,
			name: 'InvalidVaultWithdraw',
			msg: 'InvalidVaultWithdraw',
		},
		{
			code: 6005,
			name: 'InsufficientVaultShares',
			msg: 'InsufficientVaultShares',
		},
		{
			code: 6006,
			name: 'InvalidVaultWithdrawSize',
			msg: 'InvalidVaultWithdrawSize',
		},
		{
			code: 6007,
			name: 'InvalidVaultForNewDepositors',
			msg: 'InvalidVaultForNewDepositors',
		},
		{
			code: 6008,
			name: 'VaultWithdrawRequestInProgress',
			msg: 'VaultWithdrawRequestInProgress',
		},
		{
			code: 6009,
			name: 'VaultIsAtCapacity',
			msg: 'VaultIsAtCapacity',
		},
		{
			code: 6010,
			name: 'InvalidVaultDepositorInitialization',
			msg: 'InvalidVaultDepositorInitialization',
		},
		{
			code: 6011,
			name: 'DelegateNotAvailableForLiquidation',
			msg: 'DelegateNotAvailableForLiquidation',
		},
		{
			code: 6012,
			name: 'InvalidLiquidator',
			msg: 'InvalidLiquidator',
		},
		{
			code: 6013,
			name: 'LiquidationExpired',
			msg: 'LiquidationExpired',
		},
		{
			code: 6014,
			name: 'InvalidEquityValue',
			msg: 'InvalidEquityValue',
		},
		{
			code: 6015,
			name: 'VaultInLiquidation',
			msg: 'VaultInLiquidation',
		},
		{
			code: 6016,
			name: 'InvestorCanWithdraw',
			msg: 'InvestorCanWithdraw',
		},
		{
			code: 6017,
			name: 'InvalidVaultInitialization',
			msg: 'InvalidVaultInitialization',
		},
		{
			code: 6018,
			name: 'InvalidVaultUpdate',
			msg: 'InvalidVaultUpdate',
		},
		{
			code: 6019,
			name: 'PermissionedVault',
			msg: 'PermissionedVault',
		},
		{
			code: 6020,
			name: 'WithdrawInProgress',
			msg: 'WithdrawInProgress',
		},
		{
			code: 6021,
			name: 'SharesPercentTooLarge',
			msg: 'SharesPercentTooLarge',
		},
		{
			code: 6022,
			name: 'InvalidVaultDeposit',
			msg: 'InvalidVaultDeposit',
		},
		{
			code: 6023,
			name: 'OngoingLiquidation',
			msg: 'OngoingLiquidation',
		},
		{
			code: 6024,
			name: 'VaultProtocolMissing',
			msg: 'VaultProtocolMissing',
		},
		{
			code: 6025,
			name: 'BnConversion',
			msg: 'BnConversion',
		},
		{
			code: 6026,
			name: 'MathError',
			msg: 'MathError',
		},
		{
			code: 6027,
			name: 'CastError',
			msg: 'CastError',
		},
		{
			code: 6028,
			name: 'UnwrapError',
			msg: 'UnwrapError',
		},
		{
			code: 6029,
			name: 'MarketDeserializationError',
			msg: 'MarketDeserializationError',
		},
		{
			code: 6030,
			name: 'UnrecognizedQuoteMint',
			msg: 'UnrecognizedQuoteMint',
		},
		{
			code: 6031,
			name: 'SolMarketMissing',
			msg: 'SolMarketMissing',
		},
		{
			code: 6032,
			name: 'MarketMissingInRemainingAccounts',
			msg: 'MarketMissingInRemainingAccounts',
		},
		{
			code: 6033,
			name: 'MarketRegistryMismatch',
			msg: 'MarketRegistryMismatch',
		},
		{
			code: 6034,
			name: 'OrderPacketDeserialization',
			msg: 'OrderPacketDeserialization',
		},
		{
			code: 6035,
			name: 'OrderPacketMustUseDepositedFunds',
			msg: 'OrderPacketMustUseDepositedFunds',
		},
		{
			code: 6036,
			name: 'InvalidPhoenixInstruction',
			msg: 'InvalidPhoenixInstruction',
		},
		{
			code: 6037,
			name: 'OrderPacketMustBeTakeOnly',
			msg: 'OrderPacketMustBeTakeOnly',
		},
		{
			code: 6038,
			name: 'BaseLotsMustBeZero',
			msg: 'BaseLotsMustBeZero',
		},
		{
			code: 6039,
			name: 'TraderStateNotFound',
			msg: 'TraderStateNotFound',
		},
		{
			code: 6040,
			name: 'MarketPositionNotFound',
			msg: 'MarketPositionNotFound',
		},
	],
};
