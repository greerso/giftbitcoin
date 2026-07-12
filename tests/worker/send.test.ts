// tests/worker/send.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as btc from '@scure/btc-signer';
import { createGift } from '../../src/lib/crypto/create-gift';
import { buildPackages, fullClaimLink, claimLinkWithPassphrase } from '../../src/lib/gift-package';
import { validateSend, verifyTurnstile, checkFunded, sha256Hex, renderEmail, handleSend } from '../../worker/src/send';
import { stubFetch } from '../lib/helpers';
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

describe('worker gates', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('verifyTurnstile: success, failure, and fetch-error → false', async () => {
		stubFetch({ '/siteverify': () => new Response(JSON.stringify({ success: true })) });
		expect(await verifyTurnstile('tok', '1.2.3.4', 'sec')).toBe(true);
		stubFetch({ '/siteverify': () => new Response(JSON.stringify({ success: false })) });
		expect(await verifyTurnstile('tok', '1.2.3.4', 'sec')).toBe(false);
		vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('net'); }));
		expect(await verifyTurnstile('tok', '1.2.3.4', 'sec')).toBe(false);
	});

	it('checkFunded: confirmed / unconfirmed / empty', async () => {
		const env = { ESPLORA_BASE: 'https://esplora.test' } as any;
		stubFetch({ '/utxo': () => new Response(JSON.stringify([{ value: 1, status: { confirmed: true } }])) });
		expect(await checkFunded('tb1qaddr', env)).toBe(true);
		stubFetch({ '/utxo': () => new Response(JSON.stringify([{ value: 1, status: { confirmed: false } }])) });
		expect(await checkFunded('tb1qaddr', env)).toBe(false);
		stubFetch({ '/utxo': () => new Response('[]') });
		expect(await checkFunded('tb1qaddr', env)).toBe(false);
	});

	it('checkFunded THROWS on esplora failure (fail closed — caller must not email)', async () => {
		const env = { ESPLORA_BASE: 'https://esplora.test' } as any;
		stubFetch({ '/utxo': () => new Response('down', { status: 503 }) });
		await expect(checkFunded('tb1qaddr', env)).rejects.toThrow();
		vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout'); }));
		await expect(checkFunded('tb1qaddr', env)).rejects.toThrow();
	});

	it('sha256Hex is stable', async () => {
		expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
	});
});

function mockEnv(overrides: Partial<Record<string, unknown>> = {}) {
	const sent: any[] = [];
	const env = {
		EMAIL: { send: vi.fn(async (m: any) => { sent.push(m); return { messageId: 'id' }; }) },
		IP_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
		ADDR_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
		TURNSTILE_SECRET: 'sec',
		ALLOWED_ORIGIN: 'https://giftbitcoin.app',
		FROM_EMAIL: 'gifts@giftbitcoin.app',
		ESPLORA_BASE: 'https://esplora.test',
		...overrides
	};
	return { env: env as any, sent };
}
const post = (body: unknown) =>
	new Request('https://giftbitcoin.app/api/send', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
		body: JSON.stringify(body)
	});

describe('renderEmail', () => {
	it('escapes HTML in from_name/message; link is present; template is fixed', () => {
		const { subject, html, text } = renderEmail(
			'https://giftbitcoin.app/c#g1.AAAA',
			'<b>Eve</b>',
			'Hi <script>alert(1)</script>'
		);
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
		expect(html).toContain('&lt;b&gt;Eve&lt;/b&gt;');
		expect(html).toContain('https://giftbitcoin.app/c#g1.AAAA');
		expect(text).toContain('https://giftbitcoin.app/c#g1.AAAA');
		expect(subject).toContain('Bitcoin gift');
		expect(html).toContain('4 secret words');
	});
});

describe('handleSend', () => {
	afterEach(() => vi.unstubAllGlobals());

	async function fundedSetup() {
		const { g, link } = await passGift();
		stubFetch({
			'/siteverify': () => new Response(JSON.stringify({ success: true })),
			'/utxo': () => new Response(JSON.stringify([{ value: 1, status: { confirmed: true } }]))
		});
		return { g, link };
	}

	it('happy path: 200, one email sent to recipient with the link', async () => {
		const { link } = await fundedSetup();
		const { env, sent } = mockEnv();
		const res = await handleSend(post({ to: 'r@x.co', link, turnstile_token: 't', from_name: 'Al', message: 'hi' }), env);
		expect(res.status).toBe(200);
		expect(sent.length).toBe(1);
		expect(sent[0].to).toBe('r@x.co');
		expect(sent[0].html).toContain(link);
		expect(sent[0].from.email).toBe('gifts@giftbitcoin.app');
	}, 30_000);

	it('405 non-POST; 400 bad JSON', async () => {
		const { env } = mockEnv();
		expect((await handleSend(new Request('https://x/api/send'), env)).status).toBe(405);
		const badJson = new Request('https://x/api/send', { method: 'POST', body: '{nope' });
		expect((await handleSend(badJson, env)).status).toBe(400);
	});

	it('429 when IP or address limiter says no — before any esplora/turnstile call', async () => {
		const { link } = await fundedSetup();
		const { env, sent } = mockEnv({ IP_LIMIT: { limit: async () => ({ success: false }) } });
		const res = await handleSend(post({ to: 'r@x.co', link, turnstile_token: 't' }), env);
		expect(res.status).toBe(429);
		expect(sent.length).toBe(0);
		const { env: env2 } = mockEnv({ ADDR_LIMIT: { limit: async () => ({ success: false }) } });
		expect((await handleSend(post({ to: 'r@x.co', link, turnstile_token: 't' }), env2)).status).toBe(429);
	}, 30_000);

	it('IP rate limit wins over a validation failure — proves IP limit runs before validateSend', async () => {
		const { env, sent } = mockEnv({ IP_LIMIT: { limit: async () => ({ success: false }) } });
		// valid JSON, but fails validateSend (no link/turnstile_token) — would be 400 on its own
		const res = await handleSend(post({ to: 'not-an-email' }), env);
		expect(res.status).toBe(429);
		expect(sent.length).toBe(0);
	}, 30_000);

	it('address rate limit wins over a turnstile failure — proves addr limit runs before turnstile', async () => {
		const { link } = await passGift();
		stubFetch({ '/siteverify': () => new Response(JSON.stringify({ success: false })) }); // would be 403 on its own
		const { env, sent } = mockEnv({ ADDR_LIMIT: { limit: async () => ({ success: false }) } });
		const res = await handleSend(post({ to: 'r@x.co', link, turnstile_token: 't' }), env);
		expect(res.status).toBe(429);
		expect(sent.length).toBe(0);
	}, 30_000);

	it('turnstile failure wins over a funding failure — proves turnstile runs before checkFunded', async () => {
		const { link } = await passGift();
		stubFetch({
			'/siteverify': () => new Response(JSON.stringify({ success: false })),
			'/utxo': () => new Response('down', { status: 503 }) // would be 502 on its own
		});
		const { env, sent } = mockEnv();
		const res = await handleSend(post({ to: 'r@x.co', link, turnstile_token: 't' }), env);
		expect(res.status).toBe(403);
		expect(sent.length).toBe(0);
	}, 30_000);

	it('403 on turnstile failure; no email', async () => {
		const { link } = await passGift();
		stubFetch({
			'/siteverify': () => new Response(JSON.stringify({ success: false })),
			'/utxo': () => new Response(JSON.stringify([{ value: 1, status: { confirmed: true } }]))
		});
		const { env, sent } = mockEnv();
		expect((await handleSend(post({ to: 'r@x.co', link, turnstile_token: 't' }), env)).status).toBe(403);
		expect(sent.length).toBe(0);
	}, 30_000);

	it('400 unfunded; 502 esplora down (fail closed) — no email either way', async () => {
		const { link } = await passGift();
		const { env, sent } = mockEnv();
		stubFetch({
			'/siteverify': () => new Response(JSON.stringify({ success: true })),
			'/utxo': () => new Response('[]')
		});
		expect((await handleSend(post({ to: 'r@x.co', link, turnstile_token: 't' }), env)).status).toBe(400);
		stubFetch({
			'/siteverify': () => new Response(JSON.stringify({ success: true })),
			'/utxo': () => new Response('down', { status: 503 })
		});
		expect((await handleSend(post({ to: 'r@x.co', link, turnstile_token: 't' }), env)).status).toBe(502);
		expect(sent.length).toBe(0);
	}, 30_000);

	it('502 when EMAIL.send throws', async () => {
		const { link } = await fundedSetup();
		const { env } = mockEnv({ EMAIL: { send: async () => { throw Object.assign(new Error('x'), { code: 'E_DELIVERY_FAILED' }); } } });
		expect((await handleSend(post({ to: 'r@x.co', link, turnstile_token: 't' }), env)).status).toBe(502);
	}, 30_000);
});
