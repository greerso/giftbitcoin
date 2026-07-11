import { describe, it, expect } from 'vitest';
import { computeNums, NUMS_XONLY_HEX, NUMS_ITERATIONS, numsXOnly } from '../../src/lib/crypto/nums';
import { bytesToHex } from '../../src/lib/crypto/keys';

describe('NUMS', () => {
	it('computes stable NUMS matching golden hex', () => {
		const { xOnly, iterations } = computeNums();
		expect(bytesToHex(xOnly)).toBe(NUMS_XONLY_HEX);
		expect(iterations).toBe(NUMS_ITERATIONS);
		expect(bytesToHex(numsXOnly())).toBe(NUMS_XONLY_HEX);
	});
});
