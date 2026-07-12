/**
 * Taproot gift output: claim pk(C) OR older(T) ∧ pk(R) — SPEC §4.1
 */
import * as btc from '@scure/btc-signer';
import { schnorr } from '@noble/curves/secp256k1';
import { numsXOnly } from './nums';
import { bytesToHex } from './keys';
import { ACTIVE_NETWORK } from '../../config/network';

/** Throw unless `key` is a 32-byte x-only point that lifts on secp256k1 (BIP340). */
function assertXOnlyOnCurve(key: Uint8Array, name: string): void {
	if (key.length !== 32) {
		throw new Error(`${name} must be a 32-byte x-only pubkey`);
	}
	try {
		schnorr.utils.lift_x(BigInt('0x' + bytesToHex(key)));
	} catch {
		throw new Error(`${name} is not a valid x-only point on secp256k1`);
	}
}

export interface GiftScriptParams {
	/** 32-byte x-only claim pubkey */
	C: Uint8Array;
	/** 32-byte x-only expiry pubkey */
	R: Uint8Array;
	/** Relative locktime in blocks (BIP68) */
	T: number;
	/** scure network object; defaults to the ACTIVE_NETWORK pin (SPEC §14.0) */
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
	// Canonical miniscript `and_v(v:older(T),pk(R))` → `<T> CSV VERIFY <R> CHECKSIG`
	// (the `v:` wrapper appends OP_VERIFY — NOT OP_DROP). Passing T as a plain
	// number makes Script.encode emit the minimal push (OP_1..OP_16 for T≤16),
	// byte-identical to rust-miniscript so the descriptor and the funded address
	// agree — required for offline recovery via the descriptor (SPEC §5.5).
	return btc.Script.encode([T, 'CHECKSEQUENCEVERIFY', 'VERIFY', R, 'CHECKSIG']);
}

/**
 * Build gift Taproot payment. Leaf order: claim then expiry (tree may sort;
 * 2-leaf is stable). The claim leaf MUST stay first — claim-tx.ts finalize
 * depends on encountering it before the unknown-shape CSV leaf.
 */
export function buildGiftPayment(params: GiftScriptParams): GiftPayment {
	const { C, R, T } = params;
	// Both must be real curve points. C is derived internally so is always valid;
	// R may be user/config supplied (custom / donate_project) — an off-curve R
	// would still build a fundable address whose expiry path can never be signed
	// (scure's p2tr with allowUnknownOutput does not validate the CSV leaf's key).
	assertXOnlyOnCurve(C, 'C');
	assertXOnlyOnCurve(R, 'R');
	const nums = numsXOnly();
	const claimLeaf = claimScript(C);
	const expiryLeaf = expiryScript(R, T);
	const network = params.network ?? ACTIVE_NETWORK.scure;

	const leaves = btc.taprootListToTree([
		{ script: claimLeaf, leafVersion: 0xc0 },
		{ script: expiryLeaf, leafVersion: 0xc0 }
	]);

	// 4th arg = allowUnknownOutput: the CSV expiry leaf is not a script shape
	// scure recognizes, so it must be permitted explicitly.
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
