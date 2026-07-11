import { describe, it, expect } from 'vitest';
import {
	claimPrivFromSecret,
	claimPrivFromPassphrase,
	refundPrivFromSecret,
	xOnlyFromPriv,
	bytesToHex,
	hexToBytesStrict
} from '../../src/lib/crypto/keys';
import { scalarize } from '../../src/lib/crypto/scalarize';

describe('scalarize', () => {
	it('returns valid key for typical random bytes', () => {
		const b = new Uint8Array(32).fill(1);
		const s = scalarize(b);
		expect(s.length).toBe(32);
		expect(xOnlyFromPriv(s).length).toBe(32);
	});

	it('handles all-zero by rehashing', () => {
		const b = new Uint8Array(32);
		const s = scalarize(b);
		expect(s.length).toBe(32);
		// not all zeros
		expect(s.some((x) => x !== 0)).toBe(true);
	});
});

describe('claim derivation', () => {
	const secret = hexToBytesStrict(
		'000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'
	);

	it('is deterministic without passphrase', () => {
		const a = claimPrivFromSecret(secret);
		const b = claimPrivFromSecret(secret);
		expect(bytesToHex(a)).toBe(bytesToHex(b));
		expect(xOnlyFromPriv(a).length).toBe(32);
	});

	it('differs with passphrase', async () => {
		const plain = claimPrivFromSecret(secret);
		const withPass = await claimPrivFromPassphrase(secret, 'correct horse');
		expect(bytesToHex(plain)).not.toBe(bytesToHex(withPass));
		const again = await claimPrivFromPassphrase(secret, 'correct horse');
		expect(bytesToHex(withPass)).toBe(bytesToHex(again));
	});

	it('refund derivation differs from claim', () => {
		const c = claimPrivFromSecret(secret);
		const r = refundPrivFromSecret(secret);
		expect(bytesToHex(c)).not.toBe(bytesToHex(r));
	});
});
