import { describe, it, expect } from 'vitest';
import * as btc from '@scure/btc-signer';
import { createGift, verifyGiftPackage } from '../../src/lib/crypto/create-gift';
import { hexToBytesStrict } from '../../src/lib/crypto/keys';

const NET = btc.TEST_NETWORK;

describe('createGift', () => {
	it('refund_self produces a claimable gift with a refund secret', async () => {
		const g = await createGift({ policy: 'refund_self', network: NET });
		expect(g.payment.address.startsWith('tb1p')).toBe(true);
		expect(g.claimSecret.length).toBe(32);
		expect(g.refundSecret?.length).toBe(32);
		expect(g.passphraseRequired).toBe(false);
		expect(g.claimSecretB64url.length).toBe(43);
		expect(g.descriptor).toContain('and_v(v:older(');
	});

	it('passphrase gift flags argon2id and requires no refund by policy', async () => {
		const g = await createGift({ policy: 'refund_self', passphrase: 'hunter2', network: NET });
		expect(g.passphraseRequired).toBe(true);
		expect(g.kdf.name).toBe('argon2id');
	});

	it('donate_project / custom require their R and reject a bad one', async () => {
		await expect(createGift({ policy: 'donate_project', network: NET })).rejects.toThrow();
		await expect(createGift({ policy: 'custom', network: NET })).rejects.toThrow();
		// off-curve donate R must be rejected (Reviewer B2)
		const offCurve = hexToBytesStrict(
			'0000000000000000000000000000000000000000000000000000000000000007'
		);
		await expect(
			createGift({ policy: 'donate_project', donateR: offCurve, network: NET })
		).rejects.toThrow();
	});
});

describe('verifyGiftPackage (SPEC §5.3 integrity)', () => {
	it('accepts a package that re-derives correctly', async () => {
		const g = await createGift({ policy: 'refund_self', network: NET });
		const res = await verifyGiftPackage({
			secret: g.claimSecret,
			passphraseRequired: false,
			script: {
				C_xonly: g.payment.C_xonly,
				R_xonly: g.payment.R_xonly,
				T: g.T,
				nums_xonly: g.payment.nums_xonly,
				address: g.payment.address,
				script_pub_key: g.payment.scriptPubKeyHex
			},
			network: NET
		});
		expect(res.ok).toBe(true);
		expect(res.errors).toEqual([]);
	});

	it('flags a wrong address / mismatched C', async () => {
		const g = await createGift({ policy: 'refund_self', network: NET });
		const bad = await verifyGiftPackage({
			secret: g.claimSecret,
			passphraseRequired: false,
			script: {
				C_xonly: g.payment.C_xonly,
				R_xonly: g.payment.R_xonly,
				T: g.T,
				nums_xonly: g.payment.nums_xonly,
				address: 'tb1pwrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrong0000',
				script_pub_key: g.payment.scriptPubKeyHex
			},
			network: NET
		});
		expect(bad.ok).toBe(false);
		expect(bad.errors.length).toBeGreaterThan(0);
	});

	it('flags a wrong passphrase (C will not derive)', async () => {
		const g = await createGift({ policy: 'refund_self', passphrase: 'right', network: NET });
		const bad = await verifyGiftPackage({
			secret: g.claimSecret,
			passphrase: 'wrong',
			passphraseRequired: true,
			script: {
				C_xonly: g.payment.C_xonly,
				R_xonly: g.payment.R_xonly,
				T: g.T,
				nums_xonly: g.payment.nums_xonly,
				address: g.payment.address
			},
			network: NET
		});
		expect(bad.ok).toBe(false);
	});
});
