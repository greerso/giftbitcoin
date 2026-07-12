/**
 * Claim / refund key derivation — SPEC §4.2
 */
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex as nobleBytesToHex, hexToBytes as nobleHexToBytes } from '@noble/hashes/utils';
import { schnorr } from '@noble/curves/secp256k1';
import { base64urlnopad } from '@scure/base';
import { argon2id } from 'hash-wasm';
import { scalarize } from './scalarize';

const CLAIM_INFO = new TextEncoder().encode('btcgiftcard/v1/claim');
const REFUND_INFO = new TextEncoder().encode('btcgiftcard/v1/refund');

/** SPEC §4.2.1: claim_secret / refund_secret are fixed at 32 bytes. */
function assertLen(b: Uint8Array, n: number, name: string): void {
	if (b.length !== n) {
		throw new Error(`${name} must be ${n} bytes, got ${b.length}`);
	}
}

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
	assertLen(claimSecret, 32, 'claim_secret');
	const raw = hkdf(sha256, claimSecret, undefined, CLAIM_INFO, 32);
	return scalarize(raw);
}

/** Passphrase-required claim private key — Argon2id(password=passphrase, salt=claim_secret) */
export async function claimPrivFromPassphrase(
	claimSecret: Uint8Array,
	passphrase: string
): Promise<Uint8Array> {
	assertLen(claimSecret, 32, 'claim_secret');
	// NFC-normalize so the same visual passphrase composed differently across
	// platforms (e.g. macOS NFD vs NFC "é") derives the same key.
	const normalized = passphrase.normalize('NFC');
	if (normalized.length === 0) {
		throw new Error('passphrase must not be empty');
	}
	const hashHex = await argon2id({
		password: normalized,
		salt: claimSecret,
		parallelism: 1,
		iterations: 3,
		memorySize: 65536, // KiB
		hashLength: 32,
		outputType: 'hex'
	});
	const raw = nobleHexToBytes(hashHex); // argon2 hex output is always even-length
	return scalarize(raw);
}

export function refundPrivFromSecret(refundSecret: Uint8Array): Uint8Array {
	assertLen(refundSecret, 32, 'refund_secret');
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

export function bytesToHex(b: Uint8Array): string {
	return nobleBytesToHex(b);
}

export function hexToBytesStrict(hex: string, expectedBytes?: number): Uint8Array {
	// noble's hexToBytes already throws on non-hex chars and odd length (an unchecked
	// decoder would turn a corrupted claim link into a wrong-but-valid-looking key).
	// Add the byte-length guard for the 32-byte claim-secret trust boundary.
	const out = nobleHexToBytes(hex);
	if (expectedBytes !== undefined && out.length !== expectedBytes) {
		throw new Error(`expected ${expectedBytes} bytes, got ${out.length}`);
	}
	return out;
}

/** base64url (unpadded) per SPEC §5.3/§5.4 — the on-wire encoding for secrets. */
export function bytesToB64url(b: Uint8Array): string {
	return base64urlnopad.encode(b);
}

export function b64urlToBytes(s: string, expectedBytes?: number): Uint8Array {
	const out = base64urlnopad.decode(s); // throws on invalid alphabet
	if (expectedBytes !== undefined && out.length !== expectedBytes) {
		throw new Error(`expected ${expectedBytes} bytes, got ${out.length}`);
	}
	return out;
}
