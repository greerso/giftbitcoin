/**
 * BTC price for the USD-denominated create UX. Testnet coins have no real value;
 * the price is a display convenience so amounts read in dollars. Live from the
 * indexer, with a static fallback if the request is blocked/offline.
 */

const PRICE_URL = 'https://mempool.space/api/v1/prices';

/** Display-only fallback if the price API is unreachable. */
export const FALLBACK_BTC_USD = 95_000;

export async function fetchBtcUsd(): Promise<number> {
	try {
		const r = await fetch(PRICE_URL);
		if (!r.ok) return FALLBACK_BTC_USD;
		const j = await r.json();
		const p = Number(j?.USD);
		return Number.isFinite(p) && p > 0 ? p : FALLBACK_BTC_USD;
	} catch {
		return FALLBACK_BTC_USD;
	}
}

export function usdToBtc(usd: number, priceUsd: number): number {
	return priceUsd > 0 ? usd / priceUsd : 0;
}

export function usdToSats(usd: number, priceUsd: number): number {
	return Math.round(usdToBtc(usd, priceUsd) * 1e8);
}

export function satsToBtc(sats: number): number {
	return sats / 1e8;
}

/** SPEC §8.1 normative tip: `tip_sats = floor(gift_amount_sats × pct/100)`. */
export function tipSats(giftSats: number, pct: number): number {
	return Math.floor((giftSats * pct) / 100);
}
