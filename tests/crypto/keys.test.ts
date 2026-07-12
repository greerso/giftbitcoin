import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sha256 } from '@noble/hashes/sha2';
import {
	claimPrivFromSecret,
	claimPrivFromPassphrase,
	refundPrivFromSecret,
	xOnlyFromPriv,
	bytesToHex,
	hexToBytesStrict,
	bytesToB64url,
	b64urlToBytes
} from '../../src/lib/crypto/keys';
import { scalarize } from '../../src/lib/crypto/scalarize';

const vectors = JSON.parse(
	readFileSync(new URL('../../vectors/v1.json', import.meta.url), 'utf8')
);

const secret = hexToBytesStrict(
	'000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'
);

describe('scalarize', () => {
	it('returns valid key for typical random bytes', () => {
		const s = scalarize(new Uint8Array(32).fill(1));
		expect(s.length).toBe(32);
		expect(xOnlyFromPriv(s).length).toBe(32);
	});

	it('rehashes per the frozen transcript for x==0', () => {
		// SPEC §4.2.2: b'=SHA256("btcgiftcard/v1/scalar" || b). Pin the exact formula,
		// not just "output changed" — a wrong label/order/concat would still change it.
		const zeros = new Uint8Array(32);
		const label = new TextEncoder().encode('btcgiftcard/v1/scalar');
		const expected = sha256(new Uint8Array([...label, ...zeros]));
		expect(bytesToHex(scalarize(zeros))).toBe(bytesToHex(expected));
	});

	it('rehashes when x >= n', () => {
		const big = hexToBytesStrict('ff'.repeat(32)); // > secp256k1 order
		const out = scalarize(big);
		expect(bytesToHex(out)).not.toBe(bytesToHex(big));
		expect(xOnlyFromPriv(out).length).toBe(32); // valid private key
	});
});

describe('claim derivation', () => {
	it('is deterministic without passphrase', () => {
		const a = claimPrivFromSecret(secret);
		const b = claimPrivFromSecret(secret);
		expect(bytesToHex(a)).toBe(bytesToHex(b));
		expect(xOnlyFromPriv(a).length).toBe(32);
	});

	it('refund derivation differs from claim', () => {
		expect(bytesToHex(claimPrivFromSecret(secret))).not.toBe(
			bytesToHex(refundPrivFromSecret(secret))
		);
	});

	it('matches the frozen Argon2id passphrase vector', async () => {
		const v = vectors.sample_gift_passphrase;
		const priv = await claimPrivFromPassphrase(hexToBytesStrict(v.claim_secret), v.passphrase);
		expect(bytesToHex(priv)).toBe(v.claim_priv);
		expect(bytesToHex(xOnlyFromPriv(priv))).toBe(v.C_xonly);
	});

	it('NFC-normalizes the passphrase (NFD input derives the same key)', async () => {
		const nfcStr = 'caf\u00e9'; // é precomposed (NFC)
		const nfdStr = 'cafe\u0301'; // e + combining acute (NFD)
		expect(nfcStr).not.toBe(nfdStr); // sanity: the raw strings really differ
		const nfc = await claimPrivFromPassphrase(secret, nfcStr);
		const nfd = await claimPrivFromPassphrase(secret, nfdStr);
		expect(bytesToHex(nfc)).toBe(bytesToHex(nfd));
	});

	it('rejects a non-32-byte secret', () => {
		expect(() => claimPrivFromSecret(new Uint8Array(16))).toThrow();
		expect(() => refundPrivFromSecret(new Uint8Array(31))).toThrow();
	});

	it('rejects an empty passphrase', async () => {
		await expect(claimPrivFromPassphrase(secret, '')).rejects.toThrow();
	});
});

describe('codecs', () => {
	it('hexToBytesStrict rejects non-hex and wrong length', () => {
		expect(() => hexToBytesStrict('zz')).toThrow();
		expect(() => hexToBytesStrict('abc')).toThrow(); // odd
		expect(() => hexToBytesStrict('abcd', 1)).toThrow(); // length mismatch
		expect(bytesToHex(hexToBytesStrict('00ff'))).toBe('00ff');
	});

	it('base64url round-trips and validates length', () => {
		const b = hexToBytesStrict('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
		const enc = bytesToB64url(b);
		expect(enc).not.toContain('='); // unpadded
		expect(bytesToHex(b64urlToBytes(enc, 32))).toBe(bytesToHex(b));
		expect(() => b64urlToBytes(enc, 16)).toThrow(); // wrong expected length
		expect(() => b64urlToBytes('!!!not-b64!!!')).toThrow();
	});
});
