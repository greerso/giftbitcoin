import { describe, it, expect, vi, afterEach } from 'vitest';
import { EFF_WORDLIST } from '../../src/lib/crypto/eff-wordlist';
import { generatePassphrase, normalizePassphraseInput } from '../../src/lib/crypto/passphrase';

describe('EFF wordlist', () => {
	it('has 7776 unique lowercase words', () => {
		expect(EFF_WORDLIST.length).toBe(7776);
		expect(new Set(EFF_WORDLIST).size).toBe(7776);
		// EFF large wordlist includes 4 hyphenated compounds (drop-down, felt-tip, t-shirt, yo-yo)
		for (const w of EFF_WORDLIST) expect(w).toMatch(/^[a-z-]+$/);
	});
});

describe('generatePassphrase', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('returns 4 wordlist words, single-space, NFC', () => {
		const p = generatePassphrase();
		const words = p.split(' ');
		expect(words.length).toBe(4);
		for (const w of words) expect(EFF_WORDLIST).toContain(w);
		expect(p).toBe(p.normalize('NFC'));
		expect(p).not.toMatch(/\s\s|^\s|\s$/);
	});

	it('rejection-samples: values ≥ 62208 are discarded, not folded', () => {
		// 62208 = 7776 * 8 — the largest multiple of 7776 that fits in uint16.
		// Feed: one rejected value (65535), then 62207 (→ index 7775), then three 0s.
		const feed = [65535, 62207, 0, 0, 0];
		let i = 0;
		vi.stubGlobal('crypto', {
			getRandomValues: (arr: Uint16Array) => {
				for (let j = 0; j < arr.length; j++) arr[j] = feed[Math.min(i++, feed.length - 1)];
				return arr;
			}
		});
		const p = generatePassphrase();
		const words = p.split(' ');
		// 62207 % 7776 = 7775 → last word; 65535 must NOT have produced a word
		expect(words[0]).toBe(EFF_WORDLIST[7775]);
		expect(words.slice(1)).toEqual([EFF_WORDLIST[0], EFF_WORDLIST[0], EFF_WORDLIST[0]]);
	});

	it('duplicate words are permitted (independent draws)', () => {
		vi.stubGlobal('crypto', {
			getRandomValues: (arr: Uint16Array) => arr.fill(42)
		});
		expect(generatePassphrase()).toBe(Array(4).fill(EFF_WORDLIST[42]).join(' '));
	});
});

describe('normalizePassphraseInput', () => {
	it('lowercases, collapses whitespace, trims, NFC-normalizes', () => {
		expect(normalizePassphraseInput('  Correct \t Horse\nbattery STAPLE ')).toBe(
			'correct horse battery staple'
		);
		// NFD input (e + combining acute U+0301) must come out NFC (precomposed U+00E9)
		expect(normalizePassphraseInput('café')).toBe('café');
	});
});
