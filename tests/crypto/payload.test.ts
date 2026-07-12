import { describe, it, expect } from 'vitest';
import { encodeSecretPayload, parseSecretPayload } from '../../src/lib/crypto/payload';
import { hexToBytesStrict, bytesToHex } from '../../src/lib/crypto/keys';

const secret = hexToBytesStrict(
	'000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'
);

describe('claim URL payload (SPEC §5.4)', () => {
	it('round-trips the no-passphrase form', () => {
		const payload = encodeSecretPayload(secret, false);
		expect(payload.startsWith('v1.')).toBe(true);
		expect(payload.startsWith('v1.p.')).toBe(false);
		const parsed = parseSecretPayload(payload);
		expect(parsed.passphraseRequired).toBe(false);
		expect(bytesToHex(parsed.secret)).toBe(bytesToHex(secret));
	});

	it('round-trips the passphrase form', () => {
		const payload = encodeSecretPayload(secret, true);
		expect(payload.startsWith('v1.p.')).toBe(true);
		const parsed = parseSecretPayload(payload);
		expect(parsed.passphraseRequired).toBe(true);
		expect(bytesToHex(parsed.secret)).toBe(bytesToHex(secret));
	});

	it('accepts a leading # (raw fragment)', () => {
		const parsed = parseSecretPayload('#' + encodeSecretPayload(secret, false));
		expect(bytesToHex(parsed.secret)).toBe(bytesToHex(secret));
	});

	it('uses base64url (no hex, no padding)', () => {
		const payload = encodeSecretPayload(secret, false);
		expect(payload).not.toContain('=');
		// 32-byte hex would be 64 chars; base64url is 43 — proves not hex
		expect(payload.slice('v1.'.length).length).toBe(43);
	});

	it('rejects malformed payloads instead of deriving a wrong key', () => {
		expect(() => parseSecretPayload('v2.abc')).toThrow();
		expect(() => parseSecretPayload('garbage')).toThrow();
		expect(() => parseSecretPayload('v1.!!!not-b64!!!')).toThrow();
		expect(() => parseSecretPayload('v1.AAAA')).toThrow(); // decodes but wrong length
	});
});
