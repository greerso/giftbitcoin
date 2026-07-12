// tests/worker/send.test.ts
import { describe, it, expect } from 'vitest';
import * as btc from '@scure/btc-signer';
import { createGift } from '../../src/lib/crypto/create-gift';
import { buildPackages, fullClaimLink, claimLinkWithPassphrase } from '../../src/lib/gift-package';
import { validateSend } from '../../worker/src/send';
import type { SendEnv } from '../../worker/src/types';

const env = {
	ALLOWED_ORIGIN: 'https://giftbitcoin.app',
	FROM_EMAIL: 'gifts@giftbitcoin.app',
	ESPLORA_BASE: 'https://esplora.test'
} as SendEnv;

async function passGift() {
	const g = await createGift({ policy: 'refund_self', passphrase: 'a b c d', network: btc.TEST_NETWORK });
	const packages = buildPackages(g, { amountExpectedSats: 10_000 });
	return { g, sc: packages.share_card, link: fullClaimLink(packages.share_card, env.ALLOWED_ORIGIN) };
}

describe('validateSend', () => {
	it('accepts a valid passphrase-committed link and returns the recomputed address', async () => {
		const { g, link } = await passGift();
		const r = validateSend({ to: 'a@b.co', link, turnstile_token: 't' }, env);
		expect('error' in r).toBe(false);
		if (!('error' in r)) expect(r.address).toBe(g.payment.address);
	}, 30_000);

	it('rejects: non-object, missing fields, bad email, oversize fields', async () => {
		const { link } = await passGift();
		for (const body of [
			null,
			'str',
			{},
			{ to: 'a@b.co', link },                                        // no turnstile_token
			{ to: 'not-an-email', link, turnstile_token: 't' },
			{ to: 'a@b.co', link, turnstile_token: 't', from_name: 'x'.repeat(65) },
			{ to: 'a@b.co', link, turnstile_token: 't', message: 'x'.repeat(281) }
		]) {
			const r = validateSend(body, env);
			expect('error' in r && r.status === 400).toBe(true);
		}
	}, 30_000);

	it('rejects wrong origin and non-g1 grammar', async () => {
		const { link } = await passGift();
		const evil = link.replace('https://giftbitcoin.app', 'https://evil.example');
		expect(validateSend({ to: 'a@b.co', link: evil, turnstile_token: 't' }, env)).toMatchObject({ status: 400 });
		expect(validateSend({ to: 'a@b.co', link: 'https://giftbitcoin.app/c#v1.AAAA', turnstile_token: 't' }, env)).toMatchObject({ status: 400 });
	}, 30_000);

	it('rejects three-segment links outright', async () => {
		const { sc } = await passGift();
		const three = claimLinkWithPassphrase(sc, env.ALLOWED_ORIGIN, 'a b c d');
		expect(validateSend({ to: 'a@b.co', link: three, turnstile_token: 't' }, env)).toMatchObject({ status: 400 });
	}, 30_000);

	it('rejects passphrase_required !== true', async () => {
		const g = await createGift({ policy: 'refund_self', network: btc.TEST_NETWORK }); // no passphrase
		const link = fullClaimLink(buildPackages(g, { amountExpectedSats: 10_000 }).share_card, env.ALLOWED_ORIGIN);
		expect(validateSend({ to: 'a@b.co', link, turnstile_token: 't' }, env)).toMatchObject({ status: 400 });
	});

	it('rejects a card whose address does not recompute from its script fields', async () => {
		const { g, sc } = await passGift();
		const forged = structuredClone(sc) as any;
		// address copied off a block explorer — script fields don't derive it
		forged.script.address = 'tb1puardpztfpeqnvxvz2m2mgficm7u6za9lyv6rzn9y7lqe66ye0lfq3hu3rw';
		const link = fullClaimLink(forged, env.ALLOWED_ORIGIN);
		const r = validateSend({ to: 'a@b.co', link, turnstile_token: 't' }, env);
		expect(r).toMatchObject({ status: 400 });
		// and the honest card still passes
		const ok = validateSend({ to: 'a@b.co', link: fullClaimLink(sc, env.ALLOWED_ORIGIN), turnstile_token: 't' }, env);
		expect('error' in ok).toBe(false);
		if (!('error' in ok)) expect(ok.address).toBe(g.payment.address);
	}, 30_000);

	it('rejects a g1. payload that decodes to non-object JSON instead of throwing', () => {
		// base64url('null') === 'bnVsbA' — JSON.parse('null') succeeds (doesn't
		// throw), so this must be caught by an explicit object/null check, not
		// by the parse try/catch.
		const r = validateSend(
			{ to: 'a@b.co', link: 'https://giftbitcoin.app/c#g1.bnVsbA', turnstile_token: 't' },
			env
		);
		expect(r).toEqual({ error: 'bad_link', status: 400 });
	});

	it('rejects non-testnet4 cards', async () => {
		const { sc } = await passGift();
		const alt = structuredClone(sc) as any;
		alt.network = 'mainnet';
		expect(validateSend({ to: 'a@b.co', link: fullClaimLink(alt, env.ALLOWED_ORIGIN), turnstile_token: 't' }, env)).toMatchObject({ status: 400 });
	}, 30_000);
});
