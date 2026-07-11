/**
 * NUMS internal key — SPEC §4.4
 */
import { sha256 } from '@noble/hashes/sha2';
import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytesStrict } from './keys';

const SEED = new TextEncoder().encode('BTCGiftcard/v1/NUMS');

/**
 * Compute NUMS x-only pubkey: first SHA256 chain value that lifts on the curve.
 * Returns { xOnly, iterations } where iterations is the number of rehashes after seed.
 */
export function computeNums(): { xOnly: Uint8Array; iterations: number } {
	let h = sha256(SEED);
	let iterations = 0;
	for (;;) {
		try {
			// lift_x throws if not on curve
			schnorr.utils.lift_x(BigInt('0x' + bytesToHex(h)));
			return { xOnly: h, iterations };
		} catch {
			h = sha256(h);
			iterations++;
			if (iterations > 10_000) {
				throw new Error('NUMS: no valid x after 10000 hashes');
			}
		}
	}
}

/** Frozen golden value filled after first compute (also in vectors/v1.json) */
export const NUMS_XONLY_HEX =
	'92ad1b6550ec770c856c0d2d73c770cd1d3ae50262d3fd0df7d85511f9064ef9';

export const NUMS_ITERATIONS = 0;

export function numsXOnly(): Uint8Array {
	const computed = computeNums();
	if (bytesToHex(computed.xOnly) !== NUMS_XONLY_HEX) {
		throw new Error(
			`NUMS mismatch: got ${bytesToHex(computed.xOnly)} expected ${NUMS_XONLY_HEX}`
		);
	}
	return computed.xOnly;
}

export function numsFromHex(hex: string = NUMS_XONLY_HEX): Uint8Array {
	return hexToBytesStrict(hex);
}
