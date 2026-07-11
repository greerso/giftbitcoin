/**
 * Taproot gift output: claim pk(C) OR older(T) ∧ pk(R) — SPEC §4.1
 */
import * as btc from '@scure/btc-signer';
import { numsXOnly } from './nums';
import { bytesToHex } from './keys';

export interface GiftScriptParams {
	/** 32-byte x-only claim pubkey */
	C: Uint8Array;
	/** 32-byte x-only expiry pubkey */
	R: Uint8Array;
	/** Relative locktime in blocks (BIP68) */
	T: number;
	/** scure network object (TEST_NETWORK for testnet4 addresses) */
	network?: typeof btc.TEST_NETWORK | typeof btc.NETWORK;
}

export interface GiftPayment {
	address: string;
	scriptPubKey: Uint8Array;
	scriptPubKeyHex: string;
	C_xonly: string;
	R_xonly: string;
	T: number;
	nums_xonly: string;
	/** Raw leaf scripts for spending */
	claimLeaf: Uint8Array;
	expiryLeaf: Uint8Array;
	/** Full p2tr payment object for advanced use */
	payment: ReturnType<typeof btc.p2tr>;
}

function claimScript(C: Uint8Array): Uint8Array {
	return btc.Script.encode([C, 'CHECKSIG']);
}

function expiryScript(R: Uint8Array, T: number): Uint8Array {
	if (!Number.isInteger(T) || T < 1 || T > 0xffff) {
		throw new Error(`T out of BIP68 block range: ${T}`);
	}
	return btc.Script.encode([
		btc.ScriptNum().encode(BigInt(T)),
		'CHECKSEQUENCEVERIFY',
		'DROP',
		R,
		'CHECKSIG'
	]);
}

/**
 * Build gift Taproot payment. Leaf order: claim then expiry (tree may sort; 2-leaf is stable).
 */
export function buildGiftPayment(params: GiftScriptParams): GiftPayment {
	const { C, R, T } = params;
	if (C.length !== 32 || R.length !== 32) {
		throw new Error('C and R must be 32-byte x-only pubkeys');
	}
	const nums = numsXOnly();
	const claimLeaf = claimScript(C);
	const expiryLeaf = expiryScript(R, T);
	const network = params.network ?? btc.TEST_NETWORK;

	const leaves = btc.taprootListToTree([
		{ script: claimLeaf, leafVersion: 0xc0 },
		{ script: expiryLeaf, leafVersion: 0xc0 }
	]);

	// allowUnknown — NUMS has no known private key
	const payment = btc.p2tr(nums, leaves, network, true);
	if (!payment.address || !payment.script) {
		throw new Error('p2tr failed to produce address');
	}

	return {
		address: payment.address,
		scriptPubKey: payment.script,
		scriptPubKeyHex: bytesToHex(payment.script),
		C_xonly: bytesToHex(C),
		R_xonly: bytesToHex(R),
		T,
		nums_xonly: bytesToHex(nums),
		claimLeaf,
		expiryLeaf,
		payment
	};
}

export function descriptorString(C_hex: string, R_hex: string, T: number, nums_hex: string): string {
	return `tr(${nums_hex},{pk(${C_hex}),and_v(v:older(${T}),pk(${R_hex}))})`;
}
