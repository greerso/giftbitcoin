/**
 * Map 32-byte string to valid secp256k1 private key — SPEC §4.2.2
 */
import { sha256 } from '@noble/hashes/sha2';
import { bytesToNumberBE } from '@noble/curves/abstract/utils';
import { secp256k1 } from '@noble/curves/secp256k1';

const N = secp256k1.CURVE.n;
const LABEL = new TextEncoder().encode('btcgiftcard/v1/scalar');

export function scalarize(b: Uint8Array): Uint8Array {
	if (b.length !== 32) {
		throw new Error(`scalarize expects 32 bytes, got ${b.length}`);
	}
	let cur = b;
	for (let i = 0; i < 256; i++) {
		const x = bytesToNumberBE(cur);
		if (x > 0n && x < N) {
			return cur;
		}
		cur = sha256(concat(LABEL, cur));
	}
	throw new Error('scalarize: failed to find valid scalar');
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
	const out = new Uint8Array(a.length + b.length);
	out.set(a, 0);
	out.set(b, a.length);
	return out;
}
