import { describe, it, expect } from 'vitest';
import { tipSats } from '../../src/lib/pricing';

describe('tipSats (SPEC §8.1 normative: floor(gift_sats × pct/100))', () => {
	it('pins the spec examples and floors, never rounds', () => {
		expect(tipSats(100_000, 3)).toBe(3_000);
		expect(tipSats(99_999, 3)).toBe(2_999); // 2999.97 floors down
		expect(tipSats(33, 3)).toBe(0);
	});

	it('zero tip is allowed and exact', () => {
		expect(tipSats(100_000, 0)).toBe(0);
	});
});
