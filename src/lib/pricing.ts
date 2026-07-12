/**
 * BTC price for the create UX. Testnet coins have no real value; the price is a
 * display convenience so amounts can be entered in local currency or BTC.
 * Live from mempool.space, with a static USD fallback if the request fails.
 *
 * Only fiats returned by `mempool.space/api/v1/prices` are first-class. Locale
 * regions that map to unpriced currencies (INR/NGN/BRL/MXN/ZAR in the design
 * mock) fall back to USD so we never invent a rate.
 */

const PRICE_URL = 'https://mempool.space/api/v1/prices';

/** Fiats present in the mempool.space price response. */
export type PricedFiat = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'CHF' | 'AUD' | 'JPY';

export const PRICED_FIATS: readonly PricedFiat[] = [
	'USD',
	'EUR',
	'GBP',
	'CAD',
	'CHF',
	'AUD',
	'JPY'
] as const;

export const FIAT_SYMBOLS: Record<PricedFiat, string> = {
	USD: '$',
	EUR: '€',
	GBP: '£',
	CAD: '$',
	CHF: 'CHF ',
	AUD: '$',
	JPY: '¥'
};

/** Display-only fallback if the price API is unreachable. */
export const FALLBACK_BTC_USD = 95_000;

export type BtcPrices = Record<PricedFiat, number>;

export function fallbackPrices(): BtcPrices {
	return {
		USD: FALLBACK_BTC_USD,
		EUR: FALLBACK_BTC_USD * 0.92,
		GBP: FALLBACK_BTC_USD * 0.79,
		CAD: FALLBACK_BTC_USD * 1.36,
		CHF: FALLBACK_BTC_USD * 0.88,
		AUD: FALLBACK_BTC_USD * 1.52,
		JPY: FALLBACK_BTC_USD * 150
	};
}

export async function fetchBtcPrices(): Promise<BtcPrices> {
	const out = fallbackPrices();
	try {
		const r = await fetch(PRICE_URL);
		if (!r.ok) return out;
		const j = (await r.json()) as Record<string, unknown>;
		for (const code of PRICED_FIATS) {
			const p = Number(j?.[code]);
			if (Number.isFinite(p) && p > 0) out[code] = p;
		}
		return out;
	} catch {
		return out;
	}
}

/** @deprecated prefer fetchBtcPrices — kept for any call sites that only need USD */
export async function fetchBtcUsd(): Promise<number> {
	const p = await fetchBtcPrices();
	return p.USD;
}

export function usdToBtc(usd: number, priceUsd: number): number {
	return priceUsd > 0 ? usd / priceUsd : 0;
}

export function usdToSats(usd: number, priceUsd: number): number {
	return Math.round(usdToBtc(usd, priceUsd) * 1e8);
}

/** Fiat amount → sats using that fiat's BTC price. */
export function fiatToSats(amount: number, fiatPerBtc: number): number {
	return Math.round(usdToBtc(amount, fiatPerBtc) * 1e8);
}

export function btcToSats(btc: number): number {
	return Math.round(btc * 1e8);
}

export function satsToBtc(sats: number): number {
	return sats / 1e8;
}

export function satsToFiat(sats: number, fiatPerBtc: number): number {
	return satsToBtc(sats) * fiatPerBtc;
}

/** SPEC §8.1 normative tip: `tip_sats = floor(gift_amount_sats × pct/100)`. */
export function tipSats(giftSats: number, pct: number): number {
	return Math.floor((giftSats * pct) / 100);
}

export type LocaleFiat = {
	code: PricedFiat;
	symbol: string;
	/** SV/CF (bitcoin legal tender) default the amount toggle to BTC. */
	defaultDenom: 'fiat' | 'btc';
};

/**
 * Map browser locale region → priced fiat. Unmapped / unpriced regions → USD.
 * SV + CF default denomination to BTC (design handoff v2).
 */
export function detectLocaleFiat(locale?: string): LocaleFiat {
	const raw =
		locale ||
		(typeof Intl !== 'undefined'
			? Intl.DateTimeFormat().resolvedOptions().locale
			: typeof navigator !== 'undefined'
				? navigator.language
				: 'en-US');
	const region = (raw.split(/[-_]/)[1] || '').toUpperCase();

	if (region === 'SV' || region === 'CF') {
		return { code: 'USD', symbol: FIAT_SYMBOLS.USD, defaultDenom: 'btc' };
	}

	const map: Record<string, PricedFiat> = {
		US: 'USD',
		GB: 'GBP',
		CA: 'CAD',
		AU: 'AUD',
		JP: 'JPY',
		CH: 'CHF',
		DE: 'EUR',
		FR: 'EUR',
		ES: 'EUR',
		IT: 'EUR',
		NL: 'EUR',
		IE: 'EUR',
		PT: 'EUR',
		AT: 'EUR'
		// Design also lists IN/NG/BR/MX/ZA — not in mempool prices → USD fallback
	};
	const code = map[region] ?? 'USD';
	return { code, symbol: FIAT_SYMBOLS[code], defaultDenom: 'fiat' };
}

export const FIAT_PRESETS = ['25', '50', '100', '250'] as const;
export const BTC_PRESETS = ['0.0005', '0.001', '0.0025', '0.005'] as const;
