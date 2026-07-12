/**
 * Site-generated claim passphrases — SPEC §4.2.4 (generated-only, 2026-07-12).
 * 4 EFF-large-wordlist words = 4 × log2(7776) ≈ 51.7 bits.
 */
import { EFF_WORDLIST } from './eff-wordlist';

const N = EFF_WORDLIST.length; // 7776
const LIMIT = Math.floor(65536 / N) * N; // 62208 — rejection bound for uniform draws

function drawIndex(): number {
	const buf = new Uint16Array(1);
	for (;;) {
		crypto.getRandomValues(buf);
		if (buf[0] < LIMIT) return buf[0] % N;
	}
}

/** 4 words, lowercase, single-space separated, NFC (already NFC: words are ASCII). */
export function generatePassphrase(): string {
	return Array.from({ length: 4 }, () => EFF_WORDLIST[drawIndex()]).join(' ');
}

/**
 * Claim-input normalization: case-insensitive, whitespace-collapsed, NFC.
 * The raw NFC-only form is the back-compat retry (pre-2026-07-12 human passphrases).
 */
export function normalizePassphraseInput(input: string): string {
	return input.trim().toLowerCase().replace(/\s+/g, ' ').normalize('NFC');
}
