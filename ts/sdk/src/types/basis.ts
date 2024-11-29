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
					name: 'usdcVault';
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
			name: 'addInvestment';
			accounts: [
				{
					name: 'vault';
					isMut: false;
					isSigner: false;
				},
				{
					name: 'investor';
					isMut: true;
					isSigner: false;
				},
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
					name: 'poolPayer';
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
				},
				{
					name: 'driftVaultsProgram';
					isMut: false;
					isSigner: false;
				}
			];
			args: [
				{
					name: 'params';
					type: {
						defined: 'AddInvestmentParams';
					};
				}
			];
		},
		{
			name: 'removeInvestment';
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
						defined: 'RemoveInvestmentParams';
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
						name: 'usdcVault';
						docs: [
							'Token account to receive USDC when removing a fund, distributing yield, or rebalancing'
						];
						type: 'publicKey';
					},
					{
						name: 'authority';
						docs: ['Authority who can sign to modify this account'];
						type: 'publicKey';
					},
					{
						name: 'investments';
						docs: [
							'To prevent breaching the maximum remaining accounts per instruction of 32,',
							'the number of funds is limited to 16.'
						];
						type: {
							array: [
								{
									defined: 'Investment';
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
						docs: ['Last time yield was distributed from each [`Investment`]'];
						type: 'u64';
					},
					{
						name: 'lastRebalanceTs';
						docs: ['Last time the [`Investment`] weights were rebalanced'];
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
			name: 'AddInvestmentParams';
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
			name: 'RemoveInvestmentParams';
			type: {
				kind: 'struct';
				fields: [
					{
						name: 'investmentIndex';
						type: 'u8';
					}
				];
			};
		},
		{
			name: 'Investment';
			type: {
				kind: 'struct';
				fields: [
					{
						name: 'investor';
						docs: [
							'PDA of [`VaultDepositor`] account which owns shares in a [`Vault`]'
						];
						type: 'publicKey';
					},
					{
						name: 'totalProfit';
						docs: [
							'Total USDC profit distributed to the pool by this investment',
							'This is USDC (6 decimals) multiplied by QUOTE_PRECISION which is also 10^6'
						];
						type: 'u128';
					},
					{
						name: 'initTs';
						docs: ['Time this investment was initialized'];
						type: 'i64';
					},
					{
						name: 'weight';
						docs: [
							"Basis points of the investment's weight in the pool (10_000 = 100%, 1 = 0.01%)",
							"This is used during rebalancing to determine how much of the pool's funds to allocate to this investment"
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
		},
		{
			name: 'VenueType';
			type: {
				kind: 'enum';
				variants: [
					{
						name: 'Drift';
					},
					{
						name: 'Phoenix';
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
			name: 'NoInvestmentsAvailable';
			msg: 'NoFundTrackersAvailable';
		},
		{
			code: 6005;
			name: 'InvestmentNotFound';
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
					name: 'usdcVault',
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
			name: 'addInvestment',
			accounts: [
				{
					name: 'vault',
					isMut: false,
					isSigner: false,
				},
				{
					name: 'investor',
					isMut: true,
					isSigner: false,
				},
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
					name: 'poolPayer',
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
				{
					name: 'driftVaultsProgram',
					isMut: false,
					isSigner: false,
				},
			],
			args: [
				{
					name: 'params',
					type: {
						defined: 'AddInvestmentParams',
					},
				},
			],
		},
		{
			name: 'removeInvestment',
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
						defined: 'RemoveInvestmentParams',
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
						name: 'usdcVault',
						docs: [
							'Token account to receive USDC when removing a fund, distributing yield, or rebalancing',
						],
						type: 'publicKey',
					},
					{
						name: 'authority',
						docs: ['Authority who can sign to modify this account'],
						type: 'publicKey',
					},
					{
						name: 'investments',
						docs: [
							'To prevent breaching the maximum remaining accounts per instruction of 32,',
							'the number of funds is limited to 16.',
						],
						type: {
							array: [
								{
									defined: 'Investment',
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
						docs: ['Last time yield was distributed from each [`Investment`]'],
						type: 'u64',
					},
					{
						name: 'lastRebalanceTs',
						docs: ['Last time the [`Investment`] weights were rebalanced'],
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
			name: 'AddInvestmentParams',
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
			name: 'RemoveInvestmentParams',
			type: {
				kind: 'struct',
				fields: [
					{
						name: 'investmentIndex',
						type: 'u8',
					},
				],
			},
		},
		{
			name: 'Investment',
			type: {
				kind: 'struct',
				fields: [
					{
						name: 'investor',
						docs: [
							'PDA of [`VaultDepositor`] account which owns shares in a [`Vault`]',
						],
						type: 'publicKey',
					},
					{
						name: 'totalProfit',
						docs: [
							'Total USDC profit distributed to the pool by this investment',
							'This is USDC (6 decimals) multiplied by QUOTE_PRECISION which is also 10^6',
						],
						type: 'u128',
					},
					{
						name: 'initTs',
						docs: ['Time this investment was initialized'],
						type: 'i64',
					},
					{
						name: 'weight',
						docs: [
							"Basis points of the investment's weight in the pool (10_000 = 100%, 1 = 0.01%)",
							"This is used during rebalancing to determine how much of the pool's funds to allocate to this investment",
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
		{
			name: 'VenueType',
			type: {
				kind: 'enum',
				variants: [
					{
						name: 'Drift',
					},
					{
						name: 'Phoenix',
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
			name: 'NoInvestmentsAvailable',
			msg: 'NoFundTrackersAvailable',
		},
		{
			code: 6005,
			name: 'InvestmentNotFound',
			msg: 'FundTrackerNotFound',
		},
		{
			code: 6006,
			name: 'BnConversion',
			msg: 'BnConversion',
		},
	],
};
