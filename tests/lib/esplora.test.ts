import { describe, it, expect, vi, afterEach } from 'vitest';
import { recommendedFeeRate } from '../../src/lib/esplora';
import { stubFetch } from './helpers';

describe('recommendedFeeRate', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('uses the mempool.space shape when available', async () => {
		stubFetch({ '/v1/fees/recommended': () => new Response(JSON.stringify({ halfHourFee: 7 })) });
		expect(await recommendedFeeRate()).toBe(7);
	});

	it('falls back to vanilla Esplora /fee-estimates (SPEC §10.4 override)', async () => {
		stubFetch({ '/fee-estimates': () => new Response(JSON.stringify({ '3': 4.2 })) });
		expect(await recommendedFeeRate()).toBe(4.2);
	});

	it('clamps sub-1 estimates to the 1 sat/vB minrelay floor', async () => {
		// testnet4 idles at 0.1–0.5 sat/vB; an unclamped rate builds an unbroadcastable tx
		stubFetch({ '/fee-estimates': () => new Response(JSON.stringify({ '3': 0.5 })) });
		expect(await recommendedFeeRate()).toBe(1);
	});

	it('returns the conservative floor when both shapes fail', async () => {
		stubFetch({});
		expect(await recommendedFeeRate()).toBe(2);
	});
});
