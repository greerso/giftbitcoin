/** Display formatting shared across the create/claim flows. */

/** Trim trailing zeros from an 8-dp BTC string ("0.00074000" → "0.00074"). */
export function fmtBtc(n: number): string {
	const s = n.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
	return s === '' ? '0' : s;
}

/** USD with cents only when non-integer ("$50", "$49.99"). */
export function money(v: number): string {
	return (
		'$' +
		(Math.round(v * 100) / 100).toLocaleString('en-US', {
			minimumFractionDigits: v % 1 ? 2 : 0,
			maximumFractionDigits: 2
		})
	);
}

/** Middle-ellipsis a long address/txid for review rows. */
export function truncMiddle(a: string, head = 10, tail = 7): string {
	return a.length > head + tail + 1 ? a.slice(0, head) + '…' + a.slice(-tail) : a;
}
