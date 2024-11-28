export type Basis = {
	version: '0.1.0';
	name: 'basis';
	instructions: [
		{
			name: 'initializePool';
			accounts: [
				{
					name: 'authority';
					isMut: false;
					isSigner: true;
					docs: ['To-be authority of the [`Pool`]'];
				},
				{
					name: 'pool';
					isMut: true;
					isSigner: false;
				},
				{
					name: 'basisMint';
					isMut: true;
					isSigner: true;
				},
				{
					name: 'usdcMint';
					isMut: false;
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
				},
				{
					name: 'tokenProgram';
					isMut: false;
					isSigner: false;
				},
				{
					name: 'associatedTokenProgram';
					isMut: false;
					isSigner: false;
				}
			];
			args: [];
		},
		{
			name: 'addFund';
			accounts: [
				{
					name: 'authority';
					isMut: false;
					isSigner: true;
				},
				{
					name: 'pool';
					isMut: true;
					isSigner: false;
				},
				{
					name: 'token';
					isMut: true;
					isSigner: false;
				},
				{
					name: 'mint';
					isMut: false;
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
				},
				{
					name: 'tokenProgram';
					isMut: false;
					isSigner: false;
				}
			];
			args: [
				{
					name: 'params';
					type: {
						defined: 'AddFundParams';
					};
				}
			];
		},
		{
			name: 'removeFund';
			accounts: [
				{
					name: 'authority';
					isMut: false;
					isSigner: true;
				},
				{
					name: 'pool';
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
			args: [
				{
					name: 'params';
					type: {
						defined: 'RemoveFundParams';
					};
				}
			];
		}
	];
	accounts: [
		{
			name: 'pool';
			type: {
				kind: 'struct';
				fields: [
					{
						name: 'pubkey';
						docs: ['The PDA of this account'];
						type: 'publicKey';
					},
					{
						name: 'basisMint';
						docs: [
							'Mint of the yield-bearing token backed by this pool: BASIS'
						];
						type: 'publicKey';
					},
					{
						name: 'usdcMint';
						docs: [
							'USDC mint with which the yield-bearing token is burned/exchanged for, and which deposits are made in'
						];
						type: 'publicKey';
					},
					{
						name: 'authority';
						docs: ['Authority who can sign to modify this account'];
						type: 'publicKey';
					},
					{
						name: 'funds';
						docs: [
							'To prevent breaching the maximum remaining accounts per instruction of 32,',
							'the number of funds is limited to 16.'
						];
						type: {
							array: [
								{
									defined: 'FundTracker';
								},
								16
							];
						};
					},
					{
						name: 'deposits';
						docs: [
							'Total USDC deposits in the pool which backs the BASIS token'
						];
						type: 'u128';
					},
					{
						name: 'supply';
						docs: ['Outstanding supply of the BASIS token'];
						type: 'u128';
					},
					{
						name: 'exchangeRate';
						docs: ['Exchange rate of BASIS/USDC'];
						type: 'u128';
					},
					{
						name: 'lastDistributionTs';
						docs: ['Last time yield was distributed from each [`FundTracker`]'];
						type: 'u64';
					},
					{
						name: 'lastRebalanceTs';
						docs: ['Last time the [`FundTracker`] weights were rebalanced'];
						type: 'u64';
					},
					{
						name: 'initTs';
						docs: ['Time this account was initialized'];
						type: 'i64';
					},
					{
						name: 'bump';
						type: 'u8';
					},
					{
						name: 'padding';
						type: {
							array: ['u8', 7];
						};
					}
				];
			};
		}
	];
	types: [
		{
			name: 'AddFundParams';
			type: {
				kind: 'struct';
				fields: [
					{
						name: 'weight';
						type: 'u32';
					}
				];
			};
		},
		{
			name: 'RemoveFundParams';
			type: {
				kind: 'struct';
				fields: [
					{
						name: 'fundIndex';
						type: 'u8';
					}
				];
			};
		},
		{
			name: 'FundTracker';
			type: {
				kind: 'struct';
				fields: [
					{
						name: 'mint';
						docs: ["Mint of fund's tokenized shares"];
						type: 'publicKey';
					},
					{
						name: 'token';
						docs: ['Authority is [`Pool`] PDA, mint is [`FundTracker.mint`]'];
						type: 'publicKey';
					},
					{
						name: 'initTs';
						docs: ['Time this account was initialized'];
						type: 'i64';
					},
					{
						name: 'weight';
						docs: [
							"Basis points of the fund's weight in the pool (10_000 = 100%, 1 = 0.01%)"
						];
						type: 'u32';
					},
					{
						name: 'padding';
						type: {
							array: ['u8', 4];
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
			name: 'MathError';
			msg: 'MathError';
		},
		{
			code: 6002;
			name: 'CastError';
			msg: 'CastError';
		},
		{
			code: 6003;
			name: 'UnwrapError';
			msg: 'UnwrapError';
		},
		{
			code: 6004;
			name: 'NoFundTrackersAvailable';
			msg: 'NoFundTrackersAvailable';
		},
		{
			code: 6005;
			name: 'FundTrackerNotFound';
			msg: 'FundTrackerNotFound';
		},
		{
			code: 6006;
			name: 'BnConversion';
			msg: 'BnConversion';
		}
	];
};

export const IDL: Basis = {
	version: '0.1.0',
	name: 'basis',
	instructions: [
		{
			name: 'initializePool',
			accounts: [
				{
					name: 'authority',
					isMut: false,
					isSigner: true,
					docs: ['To-be authority of the [`Pool`]'],
				},
				{
					name: 'pool',
					isMut: true,
					isSigner: false,
				},
				{
					name: 'basisMint',
					isMut: true,
					isSigner: true,
				},
				{
					name: 'usdcMint',
					isMut: false,
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
				{
					name: 'tokenProgram',
					isMut: false,
					isSigner: false,
				},
				{
					name: 'associatedTokenProgram',
					isMut: false,
					isSigner: false,
				},
			],
			args: [],
		},
		{
			name: 'addFund',
			accounts: [
				{
					name: 'authority',
					isMut: false,
					isSigner: true,
				},
				{
					name: 'pool',
					isMut: true,
					isSigner: false,
				},
				{
					name: 'token',
					isMut: true,
					isSigner: false,
				},
				{
					name: 'mint',
					isMut: false,
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
				{
					name: 'tokenProgram',
					isMut: false,
					isSigner: false,
				},
			],
			args: [
				{
					name: 'params',
					type: {
						defined: 'AddFundParams',
					},
				},
			],
		},
		{
			name: 'removeFund',
			accounts: [
				{
					name: 'authority',
					isMut: false,
					isSigner: true,
				},
				{
					name: 'pool',
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
			args: [
				{
					name: 'params',
					type: {
						defined: 'RemoveFundParams',
					},
				},
			],
		},
	],
	accounts: [
		{
			name: 'pool',
			type: {
				kind: 'struct',
				fields: [
					{
						name: 'pubkey',
						docs: ['The PDA of this account'],
						type: 'publicKey',
					},
					{
						name: 'basisMint',
						docs: [
							'Mint of the yield-bearing token backed by this pool: BASIS',
						],
						type: 'publicKey',
					},
					{
						name: 'usdcMint',
						docs: [
							'USDC mint with which the yield-bearing token is burned/exchanged for, and which deposits are made in',
						],
						type: 'publicKey',
					},
					{
						name: 'authority',
						docs: ['Authority who can sign to modify this account'],
						type: 'publicKey',
					},
					{
						name: 'funds',
						docs: [
							'To prevent breaching the maximum remaining accounts per instruction of 32,',
							'the number of funds is limited to 16.',
						],
						type: {
							array: [
								{
									defined: 'FundTracker',
								},
								16,
							],
						},
					},
					{
						name: 'deposits',
						docs: [
							'Total USDC deposits in the pool which backs the BASIS token',
						],
						type: 'u128',
					},
					{
						name: 'supply',
						docs: ['Outstanding supply of the BASIS token'],
						type: 'u128',
					},
					{
						name: 'exchangeRate',
						docs: ['Exchange rate of BASIS/USDC'],
						type: 'u128',
					},
					{
						name: 'lastDistributionTs',
						docs: ['Last time yield was distributed from each [`FundTracker`]'],
						type: 'u64',
					},
					{
						name: 'lastRebalanceTs',
						docs: ['Last time the [`FundTracker`] weights were rebalanced'],
						type: 'u64',
					},
					{
						name: 'initTs',
						docs: ['Time this account was initialized'],
						type: 'i64',
					},
					{
						name: 'bump',
						type: 'u8',
					},
					{
						name: 'padding',
						type: {
							array: ['u8', 7],
						},
					},
				],
			},
		},
	],
	types: [
		{
			name: 'AddFundParams',
			type: {
				kind: 'struct',
				fields: [
					{
						name: 'weight',
						type: 'u32',
					},
				],
			},
		},
		{
			name: 'RemoveFundParams',
			type: {
				kind: 'struct',
				fields: [
					{
						name: 'fundIndex',
						type: 'u8',
					},
				],
			},
		},
		{
			name: 'FundTracker',
			type: {
				kind: 'struct',
				fields: [
					{
						name: 'mint',
						docs: ["Mint of fund's tokenized shares"],
						type: 'publicKey',
					},
					{
						name: 'token',
						docs: ['Authority is [`Pool`] PDA, mint is [`FundTracker.mint`]'],
						type: 'publicKey',
					},
					{
						name: 'initTs',
						docs: ['Time this account was initialized'],
						type: 'i64',
					},
					{
						name: 'weight',
						docs: [
							"Basis points of the fund's weight in the pool (10_000 = 100%, 1 = 0.01%)",
						],
						type: 'u32',
					},
					{
						name: 'padding',
						type: {
							array: ['u8', 4],
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
			name: 'MathError',
			msg: 'MathError',
		},
		{
			code: 6002,
			name: 'CastError',
			msg: 'CastError',
		},
		{
			code: 6003,
			name: 'UnwrapError',
			msg: 'UnwrapError',
		},
		{
			code: 6004,
			name: 'NoFundTrackersAvailable',
			msg: 'NoFundTrackersAvailable',
		},
		{
			code: 6005,
			name: 'FundTrackerNotFound',
			msg: 'FundTrackerNotFound',
		},
		{
			code: 6006,
			name: 'BnConversion',
			msg: 'BnConversion',
		},
	],
};
