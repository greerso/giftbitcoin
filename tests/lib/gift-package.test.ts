import { describe, it, expect } from 'vitest';
import {
	fullClaimLink,
	claimLinkWithPassphrase,
	parseShareCardFragment,
	fragmentPassphrase,
	buildPackages,
	verifyShareCardPassphrase
} from '../../src/lib/gift-package';
import { createGift } from '../../src/lib/crypto/create-gift';
import * as btc from '@scure/btc-signer';

const card = { script: { address: 'tb1p_test' }, claim: { secret_b64url: 'AAAA' } };
const frag = (link: string) => link.slice(link.indexOf('#') + 1);

describe('fragment grammar (SPEC §5.4)', () => {
	it('two-segment round-trip is unchanged', () => {
		const link = fullClaimLink(card, 'https://giftbitcoin.app');
		expect(frag(link).split('.').length).toBe(2);
		expect(parseShareCardFragment(frag(link))).toEqual(card);
		expect(fragmentPassphrase(frag(link))).toBeUndefined();
	});

	it('three-segment round-trips card AND passphrase; leading # accepted', () => {
		const link = claimLinkWithPassphrase(card, 'https://giftbitcoin.app', 'correct horse battery staple');
		const f = frag(link);
		expect(f.split('.').length).toBe(3);
		expect(parseShareCardFragment('#' + f)).toEqual(card);
		expect(fragmentPassphrase('#' + f)).toBe('correct horse battery staple');
	});

	it('passphrase is NFC-normalized on encode', () => {
		const nfd = 'cafe\u0301 a b c'; // e + combining acute (NFD)
		const nfc = 'caf\u00e9 a b c'; // precomposed e-acute (NFC)
		expect(nfd).not.toBe(nfc); // sanity: inputs really differ pre-normalization
		const link = claimLinkWithPassphrase(card, 'https://x', nfd);
		expect(fragmentPassphrase(frag(link))).toBe(nfc);
	});

	it('rejects an empty passphrase', () => {
		expect(() => claimLinkWithPassphrase(card, 'https://x', '')).toThrow();
	});

	it('rejects malformed fragments', () => {
		const good = frag(claimLinkWithPassphrase(card, 'https://x', 'a b c d'));
		expect(() => parseShareCardFragment(good + '.extra')).toThrow(); // 4 segments
		expect(() => parseShareCardFragment('g1.')).toThrow(); // empty card
		expect(() => parseShareCardFragment('g1.abc!def')).toThrow(); // invalid b64url
		expect(() => fragmentPassphrase('g1.AAAA.')).toThrow(); // empty passphrase segment
		expect(() => fragmentPassphrase('g1.AAAA.!!')).toThrow(); // invalid b64url passphrase
		expect(() => parseShareCardFragment('v1.AAAA')).toThrow(); // not g1.
	});
});

describe('verifyShareCardPassphrase (back-compat retry)', () => {
	// Argon2id (64 MiB, t=3) runs twice here — slow test (~seconds), keep it single.
	it('normalized input claims a generated-words gift; raw-retry claims a legacy human-passphrase gift', async () => {
		// new-style gift: generated words (already normalized form)
		const g1 = await createGift({ policy: 'refund_self', passphrase: 'correct horse battery staple', network: btc.TEST_NETWORK });
		const sc1 = buildPackages(g1, { amountExpectedSats: 10_000 }).share_card;
		const r1 = await verifyShareCardPassphrase(sc1, '  Correct \t Horse battery STAPLE ');
		expect(r1.ok).toBe(true);
		expect(r1.passphrase).toBe('correct horse battery staple');

		// legacy gift: human-chosen passphrase with case/punctuation (pre-normalization era)
		const g2 = await createGift({ policy: 'refund_self', passphrase: 'Satoshi Nakamoto 2009!', network: btc.TEST_NETWORK });
		const sc2 = buildPackages(g2, { amountExpectedSats: 10_000 }).share_card;
		const r2 = await verifyShareCardPassphrase(sc2, 'Satoshi Nakamoto 2009!');
		expect(r2.ok).toBe(true);
		expect(r2.passphrase).toBe('Satoshi Nakamoto 2009!'); // raw retry won

		// wrong words fail cleanly
		const r3 = await verifyShareCardPassphrase(sc1, 'wrong words entirely here');
		expect(r3.ok).toBe(false);
	}, 120_000);
});
