import { describe, it, expect } from 'vitest';
import {
	claimPrivFromSecret,
	refundPrivFromSecret,
	xOnlyFromPriv,
	hexToBytesStrict,
	bytesToHex
} from '../../src/lib/crypto/keys';
import { buildGiftPayment } from '../../src/lib/crypto/gift-script';
import * as btc from '@scure/btc-signer';

const SECRET = hexToBytesStrict(
	'000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'
);
const REFUND_SECRET = hexToBytesStrict(
	'ff0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'
);

describe('gift Taproot script', () => {
	const C = xOnlyFromPriv(claimPrivFromSecret(SECRET));
	const R = xOnlyFromPriv(refundPrivFromSecret(REFUND_SECRET));
	const T = 12960;

	it('builds stable testnet address', () => {
		const p1 = buildGiftPayment({ C, R, T, network: btc.TEST_NETWORK });
		const p2 = buildGiftPayment({ C, R, T, network: btc.TEST_NETWORK });
		expect(p1.address).toBe(p2.address);
		expect(p1.address.startsWith('tb1p')).toBe(true);
		expect(p1.scriptPubKey.length).toBe(34); // OP_1 + 32 push
	});

	it('changes address when T changes', () => {
		const a = buildGiftPayment({ C, R, T: 4320, network: btc.TEST_NETWORK });
		const b = buildGiftPayment({ C, R, T: 12960, network: btc.TEST_NETWORK });
		expect(a.address).not.toBe(b.address);
	});

	it('changes address when C changes', () => {
		const C2 = xOnlyFromPriv(claimPrivFromSecret(REFUND_SECRET));
		const a = buildGiftPayment({ C, R, T, network: btc.TEST_NETWORK });
		const b = buildGiftPayment({ C: C2, R, T, network: btc.TEST_NETWORK });
		expect(a.address).not.toBe(b.address);
	});

	it('matches frozen golden vector in vectors/v1.json', () => {
		const p = buildGiftPayment({ C, R, T, network: btc.TEST_NETWORK });
		expect(bytesToHex(C)).toBe(
			'bd2e8d6097e868f142b34c002454020791a84b62540160c8017bf14c45a78a01'
		);
		expect(bytesToHex(R)).toBe(
			'2ab42aebcb3799cdbbb2c4249d233e72c7deb5a1549a3f22aeda8d167f782d7e'
		);
		expect(p.address).toBe('tb1puvqel5w26fxu3he86r2za8jlhuw334938uue02wcx9ayf6znlahsj8zam4');
		expect(p.scriptPubKeyHex).toBe(
			'5120e3019fd1cad24dc8df27d0d42e9e5fbf1d18d4b13f3997a9d8317a44e853ff6f'
		);
		expect(p.nums_xonly).toBe(
			'92ad1b6550ec770c856c0d2d73c770cd1d3ae50262d3fd0df7d85511f9064ef9'
		);
	});
});
