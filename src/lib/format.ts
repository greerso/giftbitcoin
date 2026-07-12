/** Display formatting shared across the create/claim flows. */

/** Trim trailing zeros from an 8-dp BTC string ("0.00074000" → "0.00074"). */
export function fmtBtc(n: number): string {
	const s = n.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
	return s === '' ? '0' : s;
}

/**
 * Fiat display: symbol + number with cents only when non-integer.
 * Default symbol `$` keeps existing call sites working.
 */
export function money(v: number, symbol = '$'): string {
	const n = (Math.round(v * 100) / 100).toLocaleString('en-US', {
		minimumFractionDigits: v % 1 ? 2 : 0,
		maximumFractionDigits: 2
	});
	// CHF uses a trailing-space prefix ("CHF 50"); others are symbol-prefix.
	if (symbol.endsWith(' ')) return symbol + n;
	return symbol + n;
}

/** Middle-ellipsis a long address/txid for review rows. */
export function truncMiddle(a: string, head = 10, tail = 7): string {
	return a.length > head + tail + 1 ? a.slice(0, head) + '…' + a.slice(-tail) : a;
}
