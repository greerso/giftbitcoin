/**
 * Claim / refund key derivation — SPEC §4.2
 */
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { schnorr } from '@noble/curves/secp256k1';
import { argon2id } from 'hash-wasm';
import { scalarize } from './scalarize';

const CLAIM_INFO = new TextEncoder().encode('btcgiftcard/v1/claim');
const REFUND_INFO = new TextEncoder().encode('btcgiftcard/v1/refund');

export type ClaimKdf =
	| { name: 'hkdf-sha256'; info: 'btcgiftcard/v1/claim' }
	| { name: 'argon2id'; m: 65536; t: 3; p: 1; out: 32 };

export function randomSecret(bytes = 32): Uint8Array {
	const out = new Uint8Array(bytes);
	crypto.getRandomValues(out);
	return out;
}

/** No-passphrase claim private key */
export function claimPrivFromSecret(claimSecret: Uint8Array): Uint8Array {
	const ikm = claimSecret;
	const raw = hkdf(sha256, ikm, undefined, CLAIM_INFO, 32);
	return scalarize(raw);
}

/** Passphrase-required claim private key — Argon2id(password=passphrase, salt=claim_secret) */
export async function claimPrivFromPassphrase(
	claimSecret: Uint8Array,
	passphrase: string
): Promise<Uint8Array> {
	const hashHex = await argon2id({
		password: passphrase,
		salt: claimSecret,
		parallelism: 1,
		iterations: 3,
		memorySize: 65536, // KiB
		hashLength: 32,
		outputType: 'hex'
	});
	const raw = hexToBytes(hashHex);
	return scalarize(raw);
}

export function refundPrivFromSecret(refundSecret: Uint8Array): Uint8Array {
	const raw = hkdf(sha256, refundSecret, undefined, REFUND_INFO, 32);
	return scalarize(raw);
}

export function xOnlyFromPriv(priv: Uint8Array): Uint8Array {
	return schnorr.getPublicKey(priv);
}

export function claimKdfNoPass(): ClaimKdf {
	return { name: 'hkdf-sha256', info: 'btcgiftcard/v1/claim' };
}

export function claimKdfPassphrase(): ClaimKdf {
	return { name: 'argon2id', m: 65536, t: 3, p: 1, out: 32 };
}

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.length % 2 ? '0' + hex : hex;
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

export function bytesToHex(b: Uint8Array): string {
	return Array.from(b)
		.map((x) => x.toString(16).padStart(2, '0'))
		.join('');
}

export function hexToBytesStrict(hex: string): Uint8Array {
	if (hex.length % 2) throw new Error('odd hex length');
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}
