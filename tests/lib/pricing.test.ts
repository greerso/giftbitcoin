import { describe, it, expect } from 'vitest';
import {
	tipSats,
	fiatToSats,
	btcToSats,
	satsToFiat,
	detectLocaleFiat,
	FIAT_SYMBOLS
} from '../../src/lib/pricing';
import { money } from '../../src/lib/format';

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

describe('fiat/BTC amount math', () => {
	it('fiatToSats matches usdToSats semantics at $100k/BTC', () => {
		// $50 at $100_000/BTC = 0.0005 BTC = 50_000 sats
		expect(fiatToSats(50, 100_000)).toBe(50_000);
	});

	it('btcToSats rounds to nearest sat', () => {
		expect(btcToSats(0.001)).toBe(100_000);
		expect(btcToSats(0.0005)).toBe(50_000);
	});

	it('satsToFiat round-trips through fiatToSats for clean amounts', () => {
		const price = 100_000;
		const sats = fiatToSats(50, price);
		expect(satsToFiat(sats, price)).toBeCloseTo(50, 5);
	});
});

describe('detectLocaleFiat', () => {
	it('maps common regions to priced fiats', () => {
		expect(detectLocaleFiat('en-US').code).toBe('USD');
		expect(detectLocaleFiat('en-GB').code).toBe('GBP');
		expect(detectLocaleFiat('de-DE').code).toBe('EUR');
		expect(detectLocaleFiat('ja-JP').symbol).toBe(FIAT_SYMBOLS.JPY);
	});

	it('defaults SV/CF to BTC denomination (legal tender)', () => {
		expect(detectLocaleFiat('es-SV').defaultDenom).toBe('btc');
		expect(detectLocaleFiat('fr-CF').defaultDenom).toBe('btc');
	});

	it('falls back to USD for unpriced design locales (e.g. IN)', () => {
		expect(detectLocaleFiat('hi-IN').code).toBe('USD');
		expect(detectLocaleFiat('pt-BR').code).toBe('USD');
	});
});

describe('money()', () => {
	it('uses the provided symbol', () => {
		expect(money(50, '€')).toBe('€50');
		expect(money(49.99, '£')).toBe('£49.99');
	});
});
