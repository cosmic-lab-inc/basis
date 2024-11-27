import * as anchor from '@coral-xyz/anchor';
import {
	getAssociatedTokenAddress,
	createAssociatedTokenAccountInstruction,
	TOKEN_PROGRAM_ID,
	getMinimumBalanceForRentExemptMint,
	MINT_SIZE,
	createInitializeMintInstruction,
} from '@solana/spl-token';
import {
	ComputeBudgetProgram,
	Connection,
	Keypair,
	MessageV0,
	PublicKey,
	Signer,
	SystemProgram,
	TransactionInstruction,
	VersionedTransaction,
} from '@solana/web3.js';

export async function simulate(
	connection: Connection,
	payer: Signer,
	ixs: TransactionInstruction[],
	signers: Signer[] = []
): Promise<void> {
	const instructions = [
		ComputeBudgetProgram.setComputeUnitLimit({
			units: 400_000,
		}),
		ComputeBudgetProgram.setComputeUnitPrice({
			microLamports: 10_000,
		}),
		...ixs,
	];

	const recentBlockhash = await connection
		.getLatestBlockhash()
		.then((res) => res.blockhash);
	const msg = new anchor.web3.TransactionMessage({
		payerKey: payer.publicKey,
		recentBlockhash,
		instructions,
	}).compileToV0Message();

	const tx = new anchor.web3.VersionedTransaction(msg);
	tx.sign([payer, ...signers]);

	console.log(
		'signers:',
		expectedSigners(tx).map((k) => k.toString())
	);
	try {
		const sim = await connection.simulateTransaction(tx, {
			sigVerify: false,
		});
		console.log('simulation:', sim.value.err, sim.value.logs);
	} catch (e: any) {
		const missingSigners = checkMissingSigners(tx);
		console.log(
			'missing signers:',
			missingSigners.map((k) => k.toString())
		);
		throw new Error(e);
	}
}

export async function sendAndConfirm(
	connection: Connection,
	payer: Signer,
	ixs: TransactionInstruction[],
	signers: Signer[] = []
): Promise<string> {
	try {
		const instructions = [
			ComputeBudgetProgram.setComputeUnitLimit({
				units: 400_000,
			}),
			ComputeBudgetProgram.setComputeUnitPrice({
				microLamports: 10_000,
			}),
			...ixs,
		];

		const recentBlockhash = await connection
			.getLatestBlockhash()
			.then((res) => res.blockhash);
		const msg = new anchor.web3.TransactionMessage({
			payerKey: payer.publicKey,
			recentBlockhash,
			instructions,
		}).compileToV0Message();
		const tx = new anchor.web3.VersionedTransaction(msg);
		tx.sign([payer, ...signers]);

		const sim = await connection.simulateTransaction(tx, {
			sigVerify: false,
		});
		if (sim.value.err !== null) {
			console.log('simulation:', sim.value.err, sim.value.logs);
			throw new Error(JSON.stringify(sim.value.err));
		}

		const sig = await connection.sendTransaction(tx, {
			skipPreflight: true,
		});
		const confirm = await connection.confirmTransaction(sig);
		if (confirm.value.err) {
			throw new Error(JSON.stringify(confirm.value.err));
		}
		return sig;
	} catch (e: any) {
		throw new Error(e);
	}
}

function expectedSigners(tx: VersionedTransaction): PublicKey[] {
	const msg = tx.message as MessageV0;
	const signers = [];
	for (let i = 0; i < msg.staticAccountKeys.length; i++) {
		if (msg.isAccountSigner(i)) {
			signers.push(msg.staticAccountKeys[i]);
		}
	}
	return signers;
}

function checkMissingSigners(tx: VersionedTransaction): PublicKey[] {
	const msg = tx.message as MessageV0;
	const sigs = tx.signatures;
	let sigIndex = 0;
	const missingSigners = [];
	for (let i = 0; i < msg.staticAccountKeys.length; i++) {
		if (msg.isAccountSigner(i)) {
			const sig = sigs[sigIndex];
			if (sig.toString() === EMPTY_SIGNATURE.toString()) {
				missingSigners.push(msg.staticAccountKeys[i]);
			}
			sigIndex++;
		}
	}
	return missingSigners;
}

const EMPTY_SIGNATURE = Uint8Array.from([
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);

export async function createAtaIdempotent(
	connection: Connection,
	owner: PublicKey,
	payer: PublicKey,
	tokenMintAddress: PublicKey
): Promise<{
	instructions: TransactionInstruction[];
	key: PublicKey;
}> {
	const key = await getAssociatedTokenAddress(tokenMintAddress, owner, true);

	const ata = await connection.getAccountInfo(key);
	const instructions: TransactionInstruction[] = [];
	if (ata === null) {
		instructions.push(
			createAssociatedTokenAccountInstruction(
				payer,
				key,
				owner,
				tokenMintAddress
			)
		);
	}
	return {
		instructions,
		key,
	};
}

export function signatureLink(sig: string, connection: Connection): string {
	const clusterUrl = encodeURIComponent(connection.rpcEndpoint);
	return `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${clusterUrl}`;
}

export async function tokenBalance(
	conn: Connection,
	tokenAccount: PublicKey
): Promise<number> {
	const result = await conn.getTokenAccountBalance(tokenAccount);
	if (!result) {
		return 0;
	}
	const value: number | null = result.value.uiAmount;
	if (value) {
		return Number(value);
	} else {
		return 0;
	}
}

export async function createMintIxs(
	conn: Connection,
	payer: PublicKey,
	mint: Keypair,
	decimals: number,
	mintAuthority: PublicKey,
	freezeAuthority?: PublicKey
): Promise<TransactionInstruction[]> {
	const lamports = await getMinimumBalanceForRentExemptMint(conn);
	const createAcctIx = SystemProgram.createAccount({
		fromPubkey: payer,
		newAccountPubkey: mint.publicKey,
		lamports,
		space: MINT_SIZE,
		programId: TOKEN_PROGRAM_ID,
	});
	const initMintIx = createInitializeMintInstruction(
		mint.publicKey,
		decimals,
		mintAuthority,
		freezeAuthority ?? null,
		TOKEN_PROGRAM_ID
	);
	return [createAcctIx, initMintIx];
}
