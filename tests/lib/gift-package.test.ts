import { describe, it, expect } from 'vitest';
import {
	fullClaimLink,
	claimLinkWithPassphrase,
	parseShareCardFragment,
	fragmentPassphrase
} from '../../src/lib/gift-package';

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
